"""
Batch ingest: load downloaded PDFs into the database.

Usage (from project root):
    python backend/app/utils/dataset_builder/ingest_papers.py

Idempotent: safe to re-run. Papers already in the database are skipped.
Enriches metadata from Semantic Scholar API when local metadata is missing.
Uses multiprocessing for parallel PDF extraction.
"""

import os
import sys
import json
import time
import requests
from concurrent.futures import ProcessPoolExecutor, as_completed

# ── Path setup (same pattern as download_pdfs.py) ──────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
project_root = os.path.dirname(backend_dir)
sys.path.insert(0, project_root)

# ── Imports from the project ───────────────────────────────────────────
from backend.app.utils.file_processor import extract_text
from backend.app.utils.database import get_db_connection, init_database
from backend.app.utils.text_processing import TextProcessor

# ── Configuration ──────────────────────────────────────────────────────
ADMIN_USER_ID = 1
WORKERS = 8  # Number of parallel workers for PDF extraction
json_path = os.path.join(backend_dir, "data", "raw_papers", "cs_papers.json")
pdf_dir = os.path.join(backend_dir, "data", "raw_papers")

# Semantic Scholar API for metadata enrichment
S2_API_KEY = "oJ1QzmqNMN2TArRaxaZs54MRYSKjVTAV5PkGmrCY"
S2_API_URL = "https://api.semanticscholar.org/graph/v1/paper/"
S2_HEADERS = {"x-api-key": S2_API_KEY}


def fetch_paper_metadata(paper_id):
    """Fetch metadata from Semantic Scholar API for a single paper."""
    try:
        url = f"{S2_API_URL}{paper_id}?fields=title,authors,year"
        response = requests.get(url, headers=S2_HEADERS, timeout=10)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            time.sleep(5)  # rate limited, wait and return None
        return None
    except requests.RequestException:
        return None


def get_existing_filenames():
    """Return set of filenames already in the papers table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT filename FROM papers')
    filenames = {row['filename'] for row in cursor.fetchall()}
    conn.close()
    return filenames


def extract_single_pdf(args):
    """Worker function: extract text and compute n-grams from a single PDF. Runs in separate process."""
    filename, pdf_path = args
    try:
        # Use fast_mode=True for remaining stubborn PDFs that hang column_boxes
        content_text = extract_text(pdf_path, '.pdf', fast_mode=True)
        if content_text and content_text.strip():
            # Compute n-grams for similarity caching
            ngrams = TextProcessor.preprocess_for_tfidf(content_text)
            ngrams_json = json.dumps(ngrams) if ngrams else None
            return {'filename': filename, 'content': content_text, 'ngrams': ngrams_json, 'error': None}
        else:
            return {'filename': filename, 'content': None, 'ngrams': None, 'error': 'empty'}
    except Exception as e:
        return {'filename': filename, 'content': None, 'ngrams': None, 'error': str(e)[:100]}


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
    print(f"  Workers:              {WORKERS}")
    print(f"{'='*40}\n")

    if not pending:
        print("All papers already ingested. Nothing to do.")
        return

    # Prepare work items
    work_items = [(f, os.path.join(pdf_dir, f)) for f in pending]

    # Counters
    success = 0
    failed = 0
    skipped_empty = 0
    api_enriched = 0
    processed = 0
    start_time = time.time()

    # Helper to process a single result
    def process_result(result, meta_lookup):
        nonlocal success, failed, skipped_empty, api_enriched

        filename = result['filename']
        paper_id_str = os.path.splitext(filename)[0]

        if result['error'] == 'empty':
            skipped_empty += 1
            return
        elif result['error']:
            failed += 1
            print(f"  FAIL: {filename} -- {result['error']}")
            return

        # Get metadata
        meta = meta_lookup.get(paper_id_str, {})
        title = meta.get('title')
        authors = meta.get('authors', [])

        # Enrich if needed
        if not title or not authors:
            api_meta = fetch_paper_metadata(paper_id_str)
            if api_meta:
                if not title:
                    title = api_meta.get('title')
                if not authors:
                    authors = api_meta.get('authors', [])
                api_enriched += 1
                time.sleep(0.3)

        # Final fallbacks
        if not title:
            title = paper_id_str
        author_str = ", ".join([a.get('name', 'Unknown') for a in authors]) if authors else "Unknown"

        # Insert into database
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO papers (title, author, filename, file_path, content_text, preprocessed_ngrams, uploaded_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (title, author_str, filename, os.path.join(pdf_dir, filename), result['content'], result['ngrams'], ADMIN_USER_ID)
            )
            conn.commit()
            conn.close()
            success += 1
        except Exception as e:
            failed += 1
            print(f"  DB FAIL: {filename} -- {str(e)[:100]}")

    # Use single-threaded for small batches, parallel for large
    if len(pending) < 10:
        print(f"  Processing {len(pending)} files sequentially...")
        for item in work_items:
            result = extract_single_pdf(item)
            processed += 1
            process_result(result, meta_lookup)
            print(f"  Progress: {processed}/{len(pending)} | {success} OK, {failed} failed")
    else:
        print(f"  Starting parallel extraction with {WORKERS} workers...")
        with ProcessPoolExecutor(max_workers=WORKERS) as executor:
            future_to_filename = {
                executor.submit(extract_single_pdf, item): item[0]
                for item in work_items
            }

            for future in as_completed(future_to_filename):
                processed += 1
                result = future.result()
                process_result(result, meta_lookup)

                if processed % 10 == 0 or processed == len(pending):
                    elapsed = time.time() - start_time
                    rate = processed / elapsed if elapsed > 0 else 0
                    eta = (len(pending) - processed) / rate if rate > 0 else 0
                    print(f"  Progress: {processed}/{len(pending)} | "
                          f"{success} OK, {api_enriched} enriched, {failed} failed, {skipped_empty} empty | "
                          f"{elapsed:.0f}s elapsed, ~{eta:.0f}s remaining")

    elapsed = time.time() - start_time
    print(f"\n{'='*40}")
    print(f"  Ingest Complete")
    print(f"{'='*40}")
    print(f"  Ingested:       {success}")
    print(f"  API enriched:   {api_enriched}")
    print(f"  Failed:         {failed}")
    print(f"  Skipped empty:  {skipped_empty}")
    print(f"  Time:           {elapsed:.1f}s")
    print(f"{'='*40}")


if __name__ == '__main__':
    ingest()
