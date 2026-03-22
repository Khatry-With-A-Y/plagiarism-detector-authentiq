import sqlite3
from pathlib import Path
from ...config import DATABASE_PATH


def get_db_connection():
    """Get a database connection"""
    # ensure directory exists
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=30.0)
    conn.execute('PRAGMA journal_mode=WAL;')
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
            uploaded_by INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )
    ''')
    
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


if __name__ == '__main__':
    init_database()