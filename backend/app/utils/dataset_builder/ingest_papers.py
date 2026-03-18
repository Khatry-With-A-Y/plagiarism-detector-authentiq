"""
Batch ingest: load downloaded PDFs into the database.

Usage (from project root):
    python backend/app/utils/dataset_builder/ingest_papers.py

Idempotent: safe to re-run. Papers already in the database are skipped.
"""

import os
import sys
import json
import time

# ── Path setup (same pattern as download_pdfs.py) ──────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
project_root = os.path.dirname(backend_dir)
sys.path.insert(0, project_root)

# ── Imports from the project ───────────────────────────────────────────
from backend.app.utils.file_processor import extract_text
from backend.app.utils.database import get_db_connection, init_database

# ── Configuration ──────────────────────────────────────────────────────
ADMIN_USER_ID = 1
json_path = os.path.join(backend_dir, "data", "raw_papers", "cs_papers.json")
pdf_dir = os.path.join(backend_dir, "data", "raw_papers")


def get_existing_filenames():
    """Return set of filenames already in the papers table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT filename FROM papers')
    filenames = {row['filename'] for row in cursor.fetchall()}
    conn.close()
    return filenames


def ingest():
    # Ensure database and admin user exist
    init_database()

    # Load metadata
    if not os.path.exists(json_path):
        print(f"ERROR: {json_path} not found.")
        print("Run fetch_papers.py first.")
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        papers_meta = json.load(f)

    # Build lookup: paperId -> metadata
    meta_lookup = {p['paperId']: p for p in papers_meta}

    # Scan PDFs on disk
    pdf_files = sorted(
        f for f in os.listdir(pdf_dir)
        if f.lower().endswith('.pdf')
    )

    if not pdf_files:
        print("No PDF files found in", pdf_dir)
        print("Run download_pdfs.py first.")
        sys.exit(1)

    # Idempotency check
    existing = get_existing_filenames()
    pending = [f for f in pdf_files if f not in existing]

    print(f"\n{'='*40}")
    print(f"  Ingest Papers into Database")
    print(f"{'='*40}")
    print(f"  PDFs on disk:         {len(pdf_files)}")
    print(f"  Metadata entries:     {len(papers_meta)}")
    print(f"  Already in database:  {len(existing)}")
    print(f"  To ingest:            {len(pending)}")
    print(f"{'='*40}\n")

    if not pending:
        print("All papers already ingested. Nothing to do.")
        return

    # Process each pending PDF
    success = 0
    failed = 0
    skipped_empty = 0
    start_time = time.time()

    for i, filename in enumerate(pending, 1):
        pdf_path = os.path.join(pdf_dir, filename)
        paper_id_str = os.path.splitext(filename)[0]

        # Look up metadata
        meta = meta_lookup.get(paper_id_str, {})
        title = meta.get('title', paper_id_str)
        authors = meta.get('authors', [])
        author_str = ", ".join([a.get('name', 'Unknown') for a in authors]) if authors else "Unknown"

        try:
            content_text = extract_text(pdf_path, '.pdf')

            if not content_text or not content_text.strip():
                skipped_empty += 1
                print(f"  [{i}/{len(pending)}] SKIP (no text): {filename}")
                continue

            # Insert into database
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO papers (title, author, filename, file_path, content_text, uploaded_by)
                   VALUES (?, ?, ?, ?, ?, ?)''',
                (title, author_str, filename, pdf_path, content_text, ADMIN_USER_ID)
            )
            conn.commit()
            conn.close()

            success += 1

        except Exception as e:
            failed += 1
            print(f"  [{i}/{len(pending)}] FAIL: {filename} -- {str(e)[:100]}")

        # Progress report every 10 papers and at the end
        if i % 10 == 0 or i == len(pending):
            elapsed = time.time() - start_time
            rate = i / elapsed if elapsed > 0 else 0
            eta = (len(pending) - i) / rate if rate > 0 else 0
            print(f"  Progress: {i}/{len(pending)} | "
                  f"{success} OK, {failed} failed, {skipped_empty} empty | "
                  f"{elapsed:.0f}s elapsed, ~{eta:.0f}s remaining")

    elapsed = time.time() - start_time
    print(f"\n{'='*40}")
    print(f"  Ingest Complete")
    print(f"{'='*40}")
    print(f"  Ingested:      {success}")
    print(f"  Failed:        {failed}")
    print(f"  Skipped empty: {skipped_empty}")
    print(f"  Time:          {elapsed:.1f}s")
    print(f"{'='*40}")


if __name__ == '__main__':
    ingest()
