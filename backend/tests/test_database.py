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
from backend.app.models.models import Reviewer

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


def test_migrate_legacy_reviewer_status_trigger_allows_pending_apply():
    """Legacy reviewers trigger should be removed by init_database()."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_file:
        test_db_path = Path(tmp_file.name)

    original_db_path = config.DATABASE_PATH

    try:
        config.DATABASE_PATH = test_db_path
        db_utils.DATABASE_PATH = test_db_path

        conn = sqlite3.connect(test_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user' CHECK(role IN ('user', 'reviewer', 'admin')),
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked', 'paused')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE reviewers (
                user_id INTEGER PRIMARY KEY,
                application_status TEXT NOT NULL DEFAULT 'approved'
                    CHECK(application_status IN ('approved', 'rejected')),
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP,
                reviewed_by INTEGER,
                decision_reason TEXT,
                institution_domain TEXT NOT NULL,
                institution_name TEXT,
                affiliation TEXT NOT NULL,
                institutional_email TEXT NOT NULL UNIQUE,
                bio TEXT,
                expertise_tags TEXT NOT NULL DEFAULT '["CS"]',
                verified_at TIMESTAMP,
                revoked_at TIMESTAMP,
                revoked_by INTEGER,
                revoke_reason TEXT,
                email_verified INTEGER NOT NULL DEFAULT 0,
                email_verified_at TIMESTAMP,
                email_verification_token_hash TEXT,
                email_verification_expires_at TIMESTAMP,
                last_verification_sent_at TIMESTAMP,
                verification_sent_count INTEGER NOT NULL DEFAULT 0,
                verification_window_started_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
            )
        ''')

        cursor.execute('''
            CREATE TRIGGER reviewers_app_status_validate_insert
            BEFORE INSERT ON reviewers
            FOR EACH ROW
            WHEN NEW.application_status NOT IN ('approved', 'rejected')
            BEGIN
                SELECT RAISE(ABORT, 'Invalid application_status');
            END;
        ''')

        cursor.execute('''
            CREATE TRIGGER reviewers_app_status_validate_update
            BEFORE UPDATE OF application_status ON reviewers
            FOR EACH ROW
            WHEN NEW.application_status NOT IN ('approved', 'rejected')
            BEGIN
                SELECT RAISE(ABORT, 'Invalid application_status');
            END;
        ''')

        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)",
            ('legacy-user', 'legacy@example.com', 'hash', 'user', 'active')
        )
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()

        # Reproduce the legacy failure before migration.
        try:
            Reviewer.apply(
                user_id,
                'kathford.edu.np',
                'Kathford International College of Engineering and Management',
                'Student',
                'legacy@kathford.edu.np',
                'Legacy reviewer application',
                ['CS']
            )
            assert False, "Expected legacy trigger to reject pending application_status"
        except ValueError as exc:
            assert 'Application failed: Invalid application_status' in str(exc)

        # Migration should normalize status guards and allow apply().
        db_utils.init_database()
        raw_token = Reviewer.apply(
            user_id,
            'kathford.edu.np',
            'Kathford International College of Engineering and Management',
            'Student',
            'legacy@kathford.edu.np',
            'Legacy reviewer application',
            ['CS']
        )
        assert isinstance(raw_token, str) and raw_token

        conn = db_utils.get_db_connection()
        row = conn.execute(
            'SELECT application_status FROM reviewers WHERE user_id = ?',
            (user_id,)
        ).fetchone()
        conn.close()

        assert row is not None
        assert row['application_status'] == 'pending'
    finally:
        config.DATABASE_PATH = original_db_path
        db_utils.DATABASE_PATH = original_db_path
        if test_db_path.exists():
            test_db_path.unlink()


def test_migrate_legacy_reviewer_status_check_allows_pending_apply():
    """Legacy reviewers CHECK should be normalized by init_database()."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_file:
        test_db_path = Path(tmp_file.name)

    original_db_path = config.DATABASE_PATH

    try:
        config.DATABASE_PATH = test_db_path
        db_utils.DATABASE_PATH = test_db_path

        conn = sqlite3.connect(test_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user' CHECK(role IN ('user', 'reviewer', 'admin')),
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked', 'paused')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE reviewers (
                user_id INTEGER PRIMARY KEY,
                application_status TEXT NOT NULL DEFAULT 'pending_initial'
                    CHECK(application_status IN (
                        'pending_initial', 'pending_reverification', 'approved', 'rejected', 'paused'
                    )),
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP,
                reviewed_by INTEGER,
                decision_reason TEXT,
                institution_domain TEXT NOT NULL,
                institution_name TEXT,
                affiliation TEXT NOT NULL,
                institutional_email TEXT NOT NULL UNIQUE,
                bio TEXT,
                expertise_tags TEXT NOT NULL DEFAULT '["CS"]',
                verified_at TIMESTAMP,
                revoked_at TIMESTAMP,
                revoked_by INTEGER,
                revoke_reason TEXT,
                email_verified INTEGER NOT NULL DEFAULT 0,
                email_verified_at TIMESTAMP,
                email_verification_token_hash TEXT,
                email_verification_expires_at TIMESTAMP,
                last_verification_sent_at TIMESTAMP,
                verification_sent_count INTEGER NOT NULL DEFAULT 0,
                verification_window_started_at TIMESTAMP,
                paused_at TIMESTAMP,
                paused_by INTEGER,
                paused_reason TEXT,
                paused_until TIMESTAMP,
                last_pause_eval_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (paused_by) REFERENCES users(id) ON DELETE SET NULL
            )
        ''')

        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)",
            ('legacy-check-user', 'legacy-check@example.com', 'hash', 'user', 'active')
        )
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()

        # Reproduce the reported CHECK failure before migration.
        try:
            Reviewer.apply(
                user_id,
                'kathford.edu.np',
                'Kathford International College of Engineering and Management',
                'Student',
                'legacy-check@kathford.edu.np',
                'Legacy reviewer application with CHECK mismatch',
                ['CS']
            )
            assert False, "Expected legacy CHECK to reject pending application_status"
        except ValueError as exc:
            assert "Application failed: CHECK constraint failed" in str(exc)

        # Migration should normalize status guards and allow apply().
        db_utils.init_database()
        raw_token = Reviewer.apply(
            user_id,
            'kathford.edu.np',
            'Kathford International College of Engineering and Management',
            'Student',
            'legacy-check@kathford.edu.np',
            'Legacy reviewer application with CHECK mismatch',
            ['CS']
        )
        assert isinstance(raw_token, str) and raw_token

        conn = db_utils.get_db_connection()
        row = conn.execute(
            'SELECT application_status FROM reviewers WHERE user_id = ?',
            (user_id,)
        ).fetchone()
        conn.close()

        assert row is not None
        assert row['application_status'] == 'pending'
    finally:
        config.DATABASE_PATH = original_db_path
        db_utils.DATABASE_PATH = original_db_path
        if test_db_path.exists():
            test_db_path.unlink()

if __name__ == '__main__':
    test_database_initialization_stores_ngrams()
    test_migrate_legacy_reviewer_status_trigger_allows_pending_apply()
    test_migrate_legacy_reviewer_status_check_allows_pending_apply()
    print("ALL DATABASE TESTS PASSED")
