import json
import sqlite3
from pathlib import Path
from ...config import DATABASE_PATH


def get_db_connection():
    """Get a database connection with optimized settings for concurrent access"""
    # ensure directory exists
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=30.0)
    conn.execute('PRAGMA journal_mode=WAL;')       # Write-Ahead Logging for better concurrency
    conn.execute('PRAGMA synchronous=NORMAL;')     # Faster writes, still safe with WAL
    conn.execute('PRAGMA cache_size=-64000;')      # 64MB cache for faster reads
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the database with all required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if status column exists, add it if not (migration)
    cursor.execute("PRAGMA table_info(users)")
    columns = [col['name'] for col in cursor.fetchall()]
    if 'status' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked'))")
    
    # Create papers table (corpus)
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
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )
    ''')

    # Migration: Add preprocessed_ngrams column if it doesn't exist
    cursor.execute("PRAGMA table_info(papers)")
    paper_columns = [col['name'] for col in cursor.fetchall()]
    if 'preprocessed_ngrams' not in paper_columns:
        cursor.execute("ALTER TABLE papers ADD COLUMN preprocessed_ngrams TEXT")
        print("Added preprocessed_ngrams column to papers table")
    
    # Migration: Add reference exclusion columns to papers
    if 'main_content' not in paper_columns:
        cursor.execute("ALTER TABLE papers ADD COLUMN main_content TEXT")
        print("Added main_content column to papers table")
    if 'reference_section' not in paper_columns:
        cursor.execute("ALTER TABLE papers ADD COLUMN reference_section TEXT")
        print("Added reference_section column to papers table")
    if 'has_references' not in paper_columns:
        cursor.execute("ALTER TABLE papers ADD COLUMN has_references INTEGER DEFAULT 0")
        print("Added has_references column to papers table")
    
    # Create submissions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            content_text TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed')),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # Migration: Add reference exclusion columns to submissions
    cursor.execute("PRAGMA table_info(submissions)")
    submission_columns = [col['name'] for col in cursor.fetchall()]
    if 'main_content' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN main_content TEXT")
        print("Added main_content column to submissions table")
    if 'reference_section' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN reference_section TEXT")
        print("Added reference_section column to submissions table")
    if 'has_references' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN has_references INTEGER DEFAULT 0")
        print("Added has_references column to submissions table")
    
    # Create similarity_results table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS similarity_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            paper_id INTEGER NOT NULL,
            similarity_score REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id),
            FOREIGN KEY (paper_id) REFERENCES papers(id),
            UNIQUE(submission_id, paper_id)
        )
    ''')
    
    # Create indexes for better query performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_results_submission ON similarity_results(submission_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_results_paper ON similarity_results(paper_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_results_score ON similarity_results(similarity_score DESC)')

    # Migration: Add match_details column for sentence-level highlighting
    cursor.execute("PRAGMA table_info(similarity_results)")
    results_columns = [col['name'] for col in cursor.fetchall()]
    if 'match_details' not in results_columns:
        cursor.execute("ALTER TABLE similarity_results ADD COLUMN match_details TEXT")
        print("Added match_details column to similarity_results table")

    conn.commit()
    # seed a default account if none exist
    from ..models.models import User
    from .auth import hash_password

    # check for an admin user, create one if missing
    if not User.get_by_username('admin'):
        print('Creating default admin user: admin / admin')
        password_hash = hash_password('admin')
        try:
            User.create('admin', 'admin@example.com', password_hash, role='admin')
        except ValueError:
            pass

    # check for a default user, create one if missing
    if not User.get_by_username('user'):
        print('Creating default user: user / user')
        password_hash = hash_password('user')
        try:
            User.create('user', 'user@example.com', password_hash, role='user')
        except ValueError:
            pass

    conn.close()
    print(f"Database initialized at {DATABASE_PATH}")

    # Ensure all papers have preprocessed n-grams
    ensure_preprocessed_ngrams()


def ensure_preprocessed_ngrams():
    """Backfill preprocessed n-grams for papers missing them.

    Called automatically during init_database() to ensure all existing papers
    have cached n-grams for fast similarity calculations.
    Safe to run multiple times (idempotent).
    """
    from .text_processing import TextProcessor

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

    if not papers:
        return

    print(f"Backfilling n-grams for {len(papers)} papers...")

    updated = 0
    for paper in papers:
        paper_id = paper['id']
        content_text = paper['content_text']

        try:
            ngrams = TextProcessor.preprocess_for_tfidf(content_text)
            ngrams_json = json.dumps(ngrams)

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE papers SET preprocessed_ngrams = ? WHERE id = ?',
                (ngrams_json, paper_id)
            )
            conn.commit()
            conn.close()
            updated += 1
        except Exception as e:
            print(f"  Warning: Failed to compute n-grams for paper {paper_id}: {e}")

    print(f"Backfilled n-grams for {updated} papers")


if __name__ == '__main__':
    init_database()