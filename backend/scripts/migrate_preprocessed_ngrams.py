"""
Migration script: Precompute n-grams for existing corpus papers.

Run from project root:
    cd backend
    python scripts/migrate_preprocessed_ngrams.py

This script:
1. Finds all papers without preprocessed_ngrams
2. Computes n-grams from content_text
3. Stores the result in the preprocessed_ngrams column

Safe to run multiple times (idempotent).
"""

import os
import sys
import json
import time
from pathlib import Path

# Path setup - add project root (parent of backend) to path
script_dir = Path(__file__).parent
backend_dir = script_dir.parent
project_root = backend_dir.parent
sys.path.insert(0, str(project_root))

from backend.app.utils.database import get_db_connection, init_database
from backend.app.utils.text_processing import TextProcessor


def migrate_preprocessed_ngrams():
    """Compute and store preprocessed n-grams for all papers missing them."""

    # Ensure database schema is up to date (adds column if missing)
    init_database()

    conn = get_db_connection()
    cursor = conn.cursor()

    # Find papers without preprocessed n-grams
    cursor.execute('''
        SELECT id, content_text
        FROM papers
        WHERE content_text IS NOT NULL
          AND (preprocessed_ngrams IS NULL OR preprocessed_ngrams = '')
    ''')
    papers = cursor.fetchall()
    conn.close()

    total = len(papers)
    print(f"\n{'='*50}")
    print(f"  Migrate Preprocessed N-grams")
    print(f"{'='*50}")
    print(f"  Papers to process: {total}")
    print(f"{'='*50}\n")

    if total == 0:
        print("All papers already have preprocessed n-grams. Nothing to do.")
        return

    processed = 0
    failed = 0
    start_time = time.time()

    for paper in papers:
        paper_id = paper['id']
        content_text = paper['content_text']

        try:
            # Compute n-grams
            ngrams = TextProcessor.preprocess_for_tfidf(content_text)
            ngrams_json = json.dumps(ngrams)

            # Update database
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE papers SET preprocessed_ngrams = ? WHERE id = ?',
                (ngrams_json, paper_id)
            )
            conn.commit()
            conn.close()

            processed += 1

        except Exception as e:
            failed += 1
            print(f"  FAIL: Paper {paper_id} - {str(e)[:50]}")

        # Progress update every 50 papers or at end
        if (processed + failed) % 50 == 0 or (processed + failed) == total:
            elapsed = time.time() - start_time
            rate = (processed + failed) / elapsed if elapsed > 0 else 0
            eta = (total - processed - failed) / rate if rate > 0 else 0
            print(f"  Progress: {processed + failed}/{total} | "
                  f"{processed} OK, {failed} failed | "
                  f"{elapsed:.0f}s elapsed, ~{eta:.0f}s remaining")

    elapsed = time.time() - start_time
    print(f"\n{'='*50}")
    print(f"  Migration Complete")
    print(f"{'='*50}")
    print(f"  Processed: {processed}")
    print(f"  Failed:    {failed}")
    print(f"  Time:      {elapsed:.1f}s")
    print(f"{'='*50}")


if __name__ == '__main__':
    migrate_preprocessed_ngrams()
