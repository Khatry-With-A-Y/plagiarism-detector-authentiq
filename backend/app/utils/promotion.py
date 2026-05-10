"""
promotion.py — Promotion Pipeline.

When an admin approves a peer-reviewed submission, this module promotes the
submission into the corpus deterministically:

  1. Read the submission row (must be in `awaiting_admin` with a `pass`
     review_outcome, unless admin is overriding before quorum — caller's
     responsibility to enforce).
  2. Compute `content_hash` (sha256 over the canonical content text).
     If a `papers.content_hash` already matches → raise DUPLICATE_PAPER
     (unless force=True).
  3. Copy file from UPLOAD_FOLDER → CORPUS_FOLDER, disambiguating name
     collisions with a short hash-derived suffix.
  4. Reuse the `preprocessed_ngrams`, `main_content`, `reference_section`,
     `has_references` ALREADY computed on the submission row — we never
     recompute n-grams.
  5. Insert a new `papers` row with peer-review provenance:
        source='peer_reviewed',
        submission_id=<sub.id>,
        domain_tag=<sub.domain_tag>,
        content_hash=<hash>.
  6. Invalidate the in-process corpus cache so subsequent similarity
     requests pick up the new paper.

The DB insert happens inside a single `BEGIN IMMEDIATE` transaction; the
file copy is performed BEFORE the transaction starts (idempotent at the
filesystem level — a leftover copy on rollback is harmless and is cleaned
up best-effort if the DB insert fails).

Public API:
  promote_submission(submission_id, *, title, author, force=False)
      -> { paper_id, content_hash, file_path }
  Raises ValueError('DUPLICATE_PAPER') / ValueError('SUBMISSION_NOT_FOUND')
  / ValueError('NOT_ELIGIBLE_FOR_PROMOTION') / IOError on file copy failure.
"""

import hashlib
import os
import shutil
from pathlib import Path
from typing import Optional

from ...config import CORPUS_FOLDER  # UPLOAD_FOLDER is referenced indirectly via submission.file_path
from ..models.models import get_db_connection
from .corpus_cache import get_corpus_cache


def _compute_content_hash(text: str) -> str:
    """sha256 of the canonical text. Empty/None → still produces a stable
    hash so we never silently key on identical empty bodies."""
    payload = (text or '').encode('utf-8', errors='replace')
    return hashlib.sha256(payload).hexdigest()


def _hash_safe_filename(original_filename: str, content_hash: str) -> str:
    """Build a CORPUS_FOLDER-side filename that is unlikely to collide with
    existing files. We don't *guarantee* uniqueness across pre-existing
    arbitrary filenames; the second collision-handler below does that."""
    base, ext = os.path.splitext(original_filename or 'paper')
    if not ext:
        ext = '.txt'
    short_hash = content_hash[:10]
    safe_base = base.strip().replace(' ', '_')[:80] or 'paper'
    return f"{safe_base}__pr_{short_hash}{ext}"


def _copy_with_collision_suffix(src: Path, dest_dir: Path, candidate_name: str) -> Path:
    """Copy src into dest_dir as candidate_name. If candidate_name already
    exists in dest_dir, append _2, _3, ... until a free slot is found.
    Returns the final destination Path."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    base, ext = os.path.splitext(candidate_name)
    target = dest_dir / candidate_name
    suffix = 2
    while target.exists():
        target = dest_dir / f"{base}_{suffix}{ext}"
        suffix += 1
    shutil.copy2(str(src), str(target))
    return target


def promote_submission(
    submission_id: int,
    *,
    title: Optional[str] = None,
    author: Optional[str] = None,
    force: bool = False,
) -> dict:
    """
    Promote a submission into the corpus.

    Args:
        submission_id: id of the submission to promote.
        title: admin-supplied paper title; defaults to submission filename
               (without extension) when not provided.
        author: admin-supplied author; defaults to 'Unknown'.
        force: if True, bypass the duplicate-content-hash guard. Use only
               when admin explicitly accepts a duplicate (rare).

    Returns dict with keys: paper_id, content_hash, file_path.

    Raises ValueError with one of:
      - 'SUBMISSION_NOT_FOUND'
      - 'NOT_ELIGIBLE_FOR_PROMOTION'  (no content_text)
      - 'DUPLICATE_PAPER'             (when force=False)
      - 'SOURCE_FILE_MISSING'         (submission.file_path absent on disk)
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        sub_row = cur.execute(
            "SELECT id, filename, file_path, content_text, main_content, "
            "       reference_section, has_references, preprocessed_ngrams, "
            "       domain_tag "
            "FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if not sub_row:
            raise ValueError('SUBMISSION_NOT_FOUND')

        submission = dict(sub_row)
        canonical_text = submission.get('main_content') or submission.get('content_text')
        if not canonical_text:
            raise ValueError('NOT_ELIGIBLE_FOR_PROMOTION')

        content_hash = _compute_content_hash(canonical_text)

        # Duplicate-content-hash guard (Block 6 acceptance test).
        if not force:
            dup = cur.execute(
                "SELECT id FROM papers WHERE content_hash = ? LIMIT 1",
                (content_hash,),
            ).fetchone()
            if dup:
                raise ValueError('DUPLICATE_PAPER')

        # File copy (best-effort, before DB tx). If the source is missing we
        # bail with a clear error before mutating the DB.
        src_path = Path(submission['file_path'])
        if not src_path.exists():
            raise ValueError('SOURCE_FILE_MISSING')

        candidate_name = _hash_safe_filename(submission.get('filename') or src_path.name, content_hash)
        dest_path = _copy_with_collision_suffix(src_path, CORPUS_FOLDER, candidate_name)

        # ----- DB transaction (insert + version bump are one unit) -----
        try:
            cur.execute('BEGIN IMMEDIATE')

            insert_title = (title or '').strip() or os.path.splitext(submission.get('filename') or 'paper')[0]
            insert_author = (author or '').strip() or 'Unknown'

            cur.execute(
                '''
                INSERT INTO papers (
                    title, author, filename, file_path,
                    content_text, main_content, reference_section, has_references,
                    preprocessed_ngrams, uploaded_by,
                    source, submission_id, content_hash, domain_tag
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'peer_reviewed', ?, ?, ?)
                ''',
                (
                    insert_title,
                    insert_author,
                    dest_path.name,
                    str(dest_path),
                    submission.get('content_text'),
                    submission.get('main_content'),
                    submission.get('reference_section'),
                    int(bool(submission.get('has_references'))),
                    submission.get('preprocessed_ngrams'),
                    None,  # uploaded_by: peer-reviewed papers are not "uploaded by" anyone
                    submission_id,
                    content_hash,
                    submission.get('domain_tag') or 'CS',
                ),
            )
            paper_id = cur.lastrowid
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            # Best-effort: remove the orphan file copy so we don't leak FS state.
            try:
                if dest_path.exists():
                    dest_path.unlink()
            except Exception:
                pass
            raise

        # In-process cache invalidation — next similarity request reloads
        # the corpus and includes the freshly-promoted paper.
        try:
            get_corpus_cache().invalidate()
        except Exception:
            pass

        return {
            'paper_id': paper_id,
            'content_hash': content_hash,
            'file_path': str(dest_path),
        }
    finally:
        conn.close()
