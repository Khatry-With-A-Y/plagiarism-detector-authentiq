import sys
import os
import json
import sqlite3
from pathlib import Path
import tempfile

# Add root directory to path so we can import backend as a module
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
sys.path.insert(0, root_dir)

import backend.app.utils.database as db_utils
import backend.config as config

def test_database_initialization_stores_ngrams():
    """Test that init_database properly stores processed ngrams for existing corpus."""
    print("=" * 60)
    print("TEST: init_database() processes ngrams")
    print("=" * 60)

    # Use a temporary database for testing
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_file:
        test_db_path = Path(tmp_file.name)
    
    # Save original path
    original_db_path = config.DATABASE_PATH
    
    try:
        # Patch the path in config and db_utils
        config.DATABASE_PATH = test_db_path
        db_utils.DATABASE_PATH = test_db_path
        
        # Step 1: Create a basic DB with a paper but no ngrams
        # We manually create the table to simulate an old schema or a paper inserted without ngrams
        conn = db_utils.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS papers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                author TEXT,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content_text TEXT,
                preprocessed_ngrams TEXT,
                uploaded_by INTEGER,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        test_content = "This is a simple test document for testing tf-idf and ngrams."
        cursor.execute('''
            INSERT INTO papers (title, filename, file_path, content_text) 
            VALUES (?, ?, ?, ?)
        ''', ('Test Paper', 'test.txt', '/fake/path/test.txt', test_content))
        
        conn.commit()
        conn.close()
        
        # Step 2: Run init_database which should call ensure_preprocessed_ngrams
        print("Running init_database()...")
        db_utils.init_database()
        
        # Step 3: Verify the ngrams were generated and stored
        conn = db_utils.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT preprocessed_ngrams FROM papers WHERE title = ?', ('Test Paper',))
        row = cursor.fetchone()
        
        assert row is not None, "Paper not found in database"
        assert row['preprocessed_ngrams'] is not None, "ngrams were not generated"
        assert row['preprocessed_ngrams'] != '', "ngrams string is empty"
        
        # Verify it's valid JSON
        ngrams = json.loads(row['preprocessed_ngrams'])
        assert isinstance(ngrams, list), "ngrams should be a JSON list"
        assert len(ngrams) > 0, "ngrams list should not be empty"
        
        print(f"Success! Generated {len(ngrams)} ngrams.")
        print(f"Sample: {ngrams[:5]}")
        print("PASSED: Database initialization properly stored processed ngrams\n")
        
        conn.close()
        
    finally:
        # Restore original path and cleanup
        config.DATABASE_PATH = original_db_path
        db_utils.DATABASE_PATH = original_db_path
        if test_db_path.exists():
            test_db_path.unlink()

if __name__ == '__main__':
    test_database_initialization_stores_ngrams()
