"""
reset_user_data.py — Fresh-start wipe of all user-generated records.

Wipes EVERY user-related row from the database while PRESERVING the corpus
papers table (which holds the precomputed `content_text` and the cached
`preprocessed_ngrams` — recomputing those is expensive and is the whole
reason this script exists).

Tables WIPED (in dependency-safe order):
  - notifications
  - similarity_results
  - reviewers          (reviewer applications + profiles)
  - submissions        (user uploads + entire review lifecycle: votes,
                        admin decisions, pool_breakdown, etc.)
  - users              (every account, including the legacy admin/user)

Tables PRESERVED:
  - papers             (corpus + preprocessed_ngrams)  <-- the whole point

Side-effects on `papers`:
  - `papers.uploaded_by`  is NULLed for every row (the referenced user is
                          gone). The corpus content stays intact.
  - `papers.submission_id` is NULLed where set (the referenced submission
                          is gone).
  - Any row with `source='peer_reviewed'` is downgraded to
    `source='corpus_upload'` because its provenance submission no longer
    exists. The file in CORPUS_FOLDER is NOT touched — the paper itself
    remains a valid corpus document.

Filesystem:
  - `backend/data/processed/`  (UPLOAD_FOLDER) is purged by default,
                               since every submission row is gone.
                               Pass `--keep-uploads` to skip this.
  - `backend/data/raw_papers/` (CORPUS_FOLDER) is NEVER touched.

After the reset, the next time the Flask app starts, `init_database()`
will auto-recreate the default `admin / admin` and `user / user` accounts
(see `backend/app/utils/database.py`). Run `python backend/init_db.py`
afterwards if you want them recreated immediately.

Usage:
    # Dry-run (default — shows what would happen, makes no changes):
    python scripts/reset_user_data.py

    # Actually perform the wipe:
    python scripts/reset_user_data.py --yes

    # Wipe but skip the .bak DB backup:
    python scripts/reset_user_data.py --yes --no-backup

    # Wipe but keep files in backend/data/processed/:
    python scripts/reset_user_data.py --yes --keep-uploads

    # Wipe and immediately re-run init_database() so default accounts
    # come back without needing to start the app. This also refreshes
    # the table schema by DROPping them first:
    python scripts/reset_user_data.py --yes --reinit

    # DROP tables instead of DELETE without re-running init (leaves DB empty):
    python scripts/reset_user_data.py --yes --drop
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH       = ROOT / "backend" / "data" / "database.db"
UPLOAD_FOLDER = ROOT / "backend" / "data" / "processed"   # mirrors backend/config.py::UPLOAD_FOLDER
CORPUS_FOLDER = ROOT / "backend" / "data" / "raw_papers"  # NEVER touched

# Order matters: children before parents to keep FK enforcement happy.
TABLES_TO_WIPE = [
    "notifications",
    "similarity_results",
    "reviewer_invites",
    "reviewers",
    "submissions",
    "users",
]
TABLE_PRESERVED = "papers"


def _row_counts(conn: sqlite3.Connection) -> dict:
    cur = conn.cursor()
    counts = {}
    for tbl in TABLES_TO_WIPE + [TABLE_PRESERVED]:
        try:
            counts[tbl] = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        except sqlite3.OperationalError:
            counts[tbl] = "<missing>"
    return counts


def _papers_ngrams_summary(conn: sqlite3.Connection) -> dict:
    """Sanity check that we never lose the cached n-grams."""
    cur = conn.cursor()
    total = cur.execute(f"SELECT COUNT(*) FROM {TABLE_PRESERVED}").fetchone()[0]
    with_ngrams = cur.execute(
        f"SELECT COUNT(*) FROM {TABLE_PRESERVED} "
        "WHERE preprocessed_ngrams IS NOT NULL AND preprocessed_ngrams != ''"
    ).fetchone()[0]
    return {"papers_total": total, "papers_with_ngrams": with_ngrams}


def _print_counts(label: str, counts: dict) -> None:
    print(f"\n{label}")
    print("-" * len(label))
    for tbl in TABLES_TO_WIPE:
        print(f"  {tbl:<22} {counts[tbl]}")
    print(f"  {TABLE_PRESERVED:<22} {counts[TABLE_PRESERVED]}  <-- preserved")


def _backup_db(db_path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = db_path.with_suffix(db_path.suffix + f".bak.{stamp}")
    shutil.copy2(db_path, backup)
    return backup


def _purge_upload_folder(folder: Path) -> int:
    """Delete every file inside `folder`. Returns the number of files removed."""
    if not folder.exists():
        return 0
    removed = 0
    for entry in folder.iterdir():
        try:
            if entry.is_file() or entry.is_symlink():
                entry.unlink()
                removed += 1
            elif entry.is_dir():
                shutil.rmtree(entry)
                removed += 1
        except OSError as exc:
            print(f"  warning: could not remove {entry}: {exc}")
    return removed


def reset(
    db_path: Path,
    *,
    do_backup: bool,
    purge_uploads: bool,
    reinit: bool,
    drop_tables: bool = False,
) -> int:
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 2

    # 1) Backup
    if do_backup:
        backup = _backup_db(db_path)
        print(f"Backup written to: {backup}")
    else:
        print("Skipping backup (--no-backup)")

    # 2) Open connection. Disable FK enforcement so we can clear children
    #    and parents in any order; then re-enable for the integrity check.
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = OFF;")

        before = _row_counts(conn)
        ngrams_before = _papers_ngrams_summary(conn)
        _print_counts("BEFORE", before)
        print(
            f"\n  papers with cached n-grams: "
            f"{ngrams_before['papers_with_ngrams']} / {ngrams_before['papers_total']}"
        )

        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE;")

        # 3) Detach `papers` from rows we are about to nuke. We keep the
        #    paper rows themselves (corpus + n-grams), but null out FKs
        #    so we don't leave dangling references behind.
        print("\nDetaching papers from soon-to-be-deleted rows...")
        cur.execute(f"UPDATE {TABLE_PRESERVED} SET uploaded_by = NULL "
                    "WHERE uploaded_by IS NOT NULL")
        print(f"  papers.uploaded_by   -> NULL on {cur.rowcount} rows")
        cur.execute(f"UPDATE {TABLE_PRESERVED} SET submission_id = NULL "
                    "WHERE submission_id IS NOT NULL")
        print(f"  papers.submission_id -> NULL on {cur.rowcount} rows")
        # Provenance downgrade: the originating submission is gone, so the
        # paper is effectively a plain corpus upload now.
        cur.execute(
            f"UPDATE {TABLE_PRESERVED} SET source = 'corpus_upload' "
            "WHERE source = 'peer_reviewed'"
        )
        print(f"  papers.source        -> 'corpus_upload' on {cur.rowcount} rows")

        # 4) Wipe or Drop user-data tables in dependency-safe order.
        if drop_tables:
            print("\nDropping user-data tables...")
            for tbl in TABLES_TO_WIPE:
                cur.execute(f"DROP TABLE IF EXISTS {tbl}")
                print(f"  DROP TABLE IF EXISTS {tbl}")
        else:
            print("\nWiping user-data tables...")
            for tbl in TABLES_TO_WIPE:
                cur.execute(f"DELETE FROM {tbl}")
                print(f"  DELETE FROM {tbl:<22} -> {cur.rowcount} rows removed")
                # Reset AUTOINCREMENT counters so IDs start from 1 again.
                cur.execute("DELETE FROM sqlite_sequence WHERE name = ?", (tbl,))

        cur.execute("COMMIT;")

        # 5) Sanity check FK integrity, then reclaim space.
        bad = conn.execute("PRAGMA foreign_key_check").fetchall()
        if bad:
            print("\nFOREIGN KEY CHECK FAILED — restore from backup.", file=sys.stderr)
            for row in bad:
                print(f"  {tuple(row)}", file=sys.stderr)
            return 3

        conn.execute("PRAGMA foreign_keys = ON;")
        # VACUUM cannot run inside a transaction; sqlite3's autocommit is
        # active here because we already COMMITted above.
        print("\nRunning VACUUM to reclaim space...")
        conn.execute("VACUUM")

        after = _row_counts(conn)
        ngrams_after = _papers_ngrams_summary(conn)
        _print_counts("AFTER", after)
        print(
            f"\n  papers with cached n-grams: "
            f"{ngrams_after['papers_with_ngrams']} / {ngrams_after['papers_total']}"
        )

        # 6) Sanity asserts
        for tbl in TABLES_TO_WIPE:
            if drop_tables:
                if after[tbl] != "<missing>":
                    print(f"\nERROR: {tbl} should have been DROPPED but still exists!", file=sys.stderr)
                    return 4
            else:
                if after[tbl] != 0:
                    print(f"\nERROR: {tbl} still has {after[tbl]} rows!", file=sys.stderr)
                    return 4
        if after[TABLE_PRESERVED] != before[TABLE_PRESERVED]:
            print(
                f"\nERROR: papers row count changed "
                f"({before[TABLE_PRESERVED]} -> {after[TABLE_PRESERVED]})",
                file=sys.stderr,
            )
            return 5
        if ngrams_after["papers_with_ngrams"] != ngrams_before["papers_with_ngrams"]:
            print("\nERROR: cached n-grams count changed!", file=sys.stderr)
            return 6
    finally:
        conn.close()

    # 7) Purge UPLOAD_FOLDER (the file copies for the now-deleted submissions).
    if purge_uploads:
        print(f"\nPurging upload folder: {UPLOAD_FOLDER}")
        removed = _purge_upload_folder(UPLOAD_FOLDER)
        print(f"  removed {removed} entries")
    else:
        print("\nSkipping upload-folder purge (--keep-uploads).")
    print(f"Corpus folder left untouched: {CORPUS_FOLDER}")

    # 8) Optionally re-run init_database() to bring back default accounts.
    if reinit:
        print("\nRe-running init_database() to recreate default admin/user...")
        sys.path.insert(0, str(ROOT))
        from backend.app.utils.database import init_database  # noqa: E402
        init_database()

    print("\nReset complete.")
    return 0


def _dry_run_preview(db_path: Path) -> int:
    """Show what _would_ happen without making any changes."""
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 2
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        before = _row_counts(conn)
        ngrams = _papers_ngrams_summary(conn)
    finally:
        conn.close()

    print("DRY RUN — no changes will be made. Add --yes to actually wipe.\n")
    _print_counts("Current state", before)
    print(
        f"\n  papers with cached n-grams: "
        f"{ngrams['papers_with_ngrams']} / {ngrams['papers_total']}"
    )

    # File-system preview
    if UPLOAD_FOLDER.exists():
        n_uploads = sum(1 for _ in UPLOAD_FOLDER.iterdir())
    else:
        n_uploads = 0
    print(f"\n  upload folder (would be purged): {UPLOAD_FOLDER}  ({n_uploads} entries)")
    print(f"  corpus folder (will NOT be touched): {CORPUS_FOLDER}")
    print("\nRe-run with --yes to perform the reset.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Wipe all user-related rows from the database while preserving the papers/n-grams table."
    )
    parser.add_argument("--yes", action="store_true",
                        help="actually perform the wipe (without this flag the script does a dry-run)")
    parser.add_argument("--no-backup", action="store_true",
                        help="do NOT copy the database to database.db.bak.<timestamp> before wiping")
    parser.add_argument("--keep-uploads", action="store_true",
                        help="do NOT delete files inside backend/data/processed/")
    parser.add_argument("--reinit", action="store_true",
                        help="run init_database() after wiping to recreate default admin/user accounts (implies --drop)")
    parser.add_argument("--drop", action="store_true",
                        help="DROP tables instead of DELETE (ensures schema is refreshed if used with --reinit)")
    parser.add_argument("--db", type=Path, default=DB_PATH,
                        help=f"path to the SQLite database (default: {DB_PATH})")
    args = parser.parse_args(argv)

    if not args.yes:
        return _dry_run_preview(args.db)

    return reset(
        args.db,
        do_backup=not args.no_backup,
        purge_uploads=not args.keep_uploads,
        reinit=args.reinit,
        drop_tables=args.drop or args.reinit,
    )


if __name__ == "__main__":
    raise SystemExit(main())
