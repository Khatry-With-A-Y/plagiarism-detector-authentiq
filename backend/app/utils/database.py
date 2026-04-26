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
    conn.execute('PRAGMA foreign_keys=ON;')        # Enforce FK constraints
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_users_role_check(conn):
    """Idempotent rebuild of the `users` table to extend the `role` CHECK
    to ('user','reviewer','admin').

    If the current CREATE statement in sqlite_master already contains
    'reviewer', the rebuild is skipped. Otherwise we rebuild the table
    inside BEGIN EXCLUSIVE, preserving rowids (thereby preserving all FK
    references pointing at users(id)).

    See plan §Proposed Changes — Users role migration for the full sequence.
    """
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    if row is None:
        # users table not yet created — CREATE TABLE IF NOT EXISTS below
        # will create it with the expanded CHECK directly.
        return
    existing_sql = row['sql'] or ''
    if "'reviewer'" in existing_sql:
        # Already migrated; nothing to do.
        return

    print("Migrating users.role CHECK to include 'reviewer' (idempotent rebuild)...")
    # FK must be off so temporary rename/drop doesn't trip referential integrity.
    conn.execute('PRAGMA foreign_keys=OFF;')
    try:
        conn.execute('BEGIN EXCLUSIVE;')
        # Discover existing columns so INSERT SELECT preserves unknown future columns.
        col_rows = conn.execute("PRAGMA table_info(users)").fetchall()
        col_names = [c['name'] for c in col_rows]
        col_list = ', '.join(col_names)

        conn.execute('''
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user' CHECK(role IN ('user', 'reviewer', 'admin')),
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute(f'INSERT INTO users_new ({col_list}) SELECT {col_list} FROM users;')
        conn.execute('DROP TABLE users;')
        conn.execute('ALTER TABLE users_new RENAME TO users;')
        conn.execute('COMMIT;')
        # Validate nothing broke.
        conn.execute('PRAGMA foreign_key_check;')
        print("users.role CHECK rebuild completed successfully.")
    except Exception as exc:
        try:
            conn.execute('ROLLBACK;')
        except sqlite3.OperationalError:
            pass
        print(f"users.role migration FAILED and was rolled back: {exc}")
        raise
    finally:
        conn.execute('PRAGMA foreign_keys=ON;')


def init_database():
    """Initialize the database with all required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create users table (NEW installs get the expanded CHECK; EXISTING installs
    # are migrated by _migrate_users_role_check below).
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('user', 'reviewer', 'admin')),
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    # Idempotent migration: if an older `users` table exists with CHECK
    # limited to ('user','admin'), rebuild it to add 'reviewer'. Safe to
    # re-run; no-op once the CHECK already contains 'reviewer'.
    _migrate_users_role_check(conn)

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

    # Migration (Block 1): peer-review provenance columns on papers.
    # With the one-table design, review requests live on `submissions`; a
    # promoted paper links back via `submission_id` so we retain provenance
    # without needing a review_requests table.
    if 'source' not in paper_columns:
        cursor.execute(
            "ALTER TABLE papers ADD COLUMN source TEXT DEFAULT 'corpus_upload' "
            "CHECK(source IN ('corpus_upload', 'peer_reviewed'))"
        )
        print("Added source column to papers table")
    if 'submission_id' not in paper_columns:
        # FK to submissions (promoted-from). Nullable for legacy corpus_upload
        # rows. SQLite doesn't enforce FKs added via ALTER TABLE, but the
        # semantics are clear at the application layer.
        cursor.execute("ALTER TABLE papers ADD COLUMN submission_id INTEGER")
        print("Added submission_id column to papers table")
    if 'content_hash' not in paper_columns:
        cursor.execute("ALTER TABLE papers ADD COLUMN content_hash TEXT")
        print("Added content_hash column to papers table")
    if 'domain_tag' not in paper_columns:
        cursor.execute(
            "ALTER TABLE papers ADD COLUMN domain_tag TEXT NOT NULL DEFAULT 'CS'"
        )
        print("Added domain_tag column to papers table")
    
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

    # Migration (Block 1): peer-review fields absorbed into submissions.
    # In the one-table design, a submission *is* the review request. The
    # optional `review_status` discriminates: NULL means no review requested;
    # any non-null value indicates the review lifecycle state.
    # Note: ALTER TABLE ADD COLUMN in SQLite cannot attach CHECK constraints,
    # so the CHECK values below live in the API layer (see
    # backend/config.py::DOMAIN_TAGS and the /api/reviews routes).
    if 'domain_tag' not in submission_columns:
        cursor.execute(
            "ALTER TABLE submissions ADD COLUMN domain_tag TEXT NOT NULL DEFAULT 'CS'"
        )
        print("Added domain_tag column to submissions table")
    if 'review_status' not in submission_columns:
        # NULL = no review requested. Non-null values form the request lifecycle:
        # 'pending','assigned','under_review','awaiting_admin',
        # 'approved','rejected','insufficient_pool'.
        cursor.execute("ALTER TABLE submissions ADD COLUMN review_status TEXT")
        print("Added review_status column to submissions table")
    if 'review_requested_at' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN review_requested_at TIMESTAMP")
        print("Added review_requested_at column to submissions table")
    if 'review_requested_by' not in submission_columns:
        # FK to users.id (normally equals submission.user_id but stored
        # explicitly for clarity / future admin-initiated requests).
        cursor.execute("ALTER TABLE submissions ADD COLUMN review_requested_by INTEGER")
        print("Added review_requested_by column to submissions table")
    if 'review_votes' not in submission_columns:
        # JSON array of reviewer-assignment dicts. See plan
        # §Review Votes JSON Shape for the element schema.
        cursor.execute("ALTER TABLE submissions ADD COLUMN review_votes TEXT")
        print("Added review_votes column to submissions table")
    if 'pass_votes' not in submission_columns:
        # Denormalized cache refreshed from review_votes on every write; never
        # read-modify-written as source of truth.
        cursor.execute("ALTER TABLE submissions ADD COLUMN pass_votes INTEGER NOT NULL DEFAULT 0")
        print("Added pass_votes column to submissions table")
    if 'fail_votes' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN fail_votes INTEGER NOT NULL DEFAULT 0")
        print("Added fail_votes column to submissions table")
    if 'review_outcome' not in submission_columns:
        # 'pass' or 'fail' once the panel majority crystallizes.
        cursor.execute("ALTER TABLE submissions ADD COLUMN review_outcome TEXT")
        print("Added review_outcome column to submissions table")
    if 'admin_decision' not in submission_columns:
        # 'approved' or 'rejected' — admin's final call.
        cursor.execute("ALTER TABLE submissions ADD COLUMN admin_decision TEXT")
        print("Added admin_decision column to submissions table")
    if 'admin_decided_by' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN admin_decided_by INTEGER")
        print("Added admin_decided_by column to submissions table")
    if 'admin_decided_at' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN admin_decided_at TIMESTAMP")
        print("Added admin_decided_at column to submissions table")
    if 'admin_decision_reason' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN admin_decision_reason TEXT")
        print("Added admin_decision_reason column to submissions table")
    
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

    # Create notifications table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'info',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # Create indexes for better query performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_results_submission ON similarity_results(submission_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_results_paper ON similarity_results(paper_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_results_score ON similarity_results(similarity_score DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read)')

    # Migration: Add match_details column for sentence-level highlighting
    cursor.execute("PRAGMA table_info(similarity_results)")
    results_columns = [col['name'] for col in cursor.fetchall()]
    if 'match_details' not in results_columns:
        cursor.execute("ALTER TABLE similarity_results ADD COLUMN match_details TEXT")
        print("Added match_details column to similarity_results table")

    # ----------------------------------------------------------------------
    # Block 1: Peer-review & reviewer-role schema (one-table design)
    # ----------------------------------------------------------------------
    # Per plan §Schema Minimization, all peer-review data lives in:
    #   - `users`               (role CHECK extended to include 'reviewer')
    #   - `submissions`         (absorbs the review_request + review_votes JSON)
    #   - `papers`              (provenance columns: source, submission_id, ...)
    #   - `reviewers` (NEW)     (application + profile + revocation rolled into one)
    # No institutions/reviewer_profiles/reviewer_expertise/review_requests/
    # review_assignments/review_vote_history/meta tables are created.
    # corpus_version is derived from `MAX(id) FROM papers WHERE source='peer_reviewed'`.

    # reviewers: single supplementary table keyed on user_id.
    # - Rows exist for anyone who has ever applied (pending/approved/rejected).
    # - Invariant: users.role='reviewer' iff application_status='approved' AND revoked_at IS NULL.
    # - Re-applications UPDATE the existing row (P0 policy: no re-application history).
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviewers (
            user_id             INTEGER PRIMARY KEY,
            application_status  TEXT NOT NULL DEFAULT 'pending'
                                CHECK(application_status IN ('pending','approved','rejected')),
            submitted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at         TIMESTAMP,
            reviewed_by         INTEGER,
            decision_reason     TEXT,
            institution_domain  TEXT NOT NULL,
            institution_name    TEXT,
            affiliation         TEXT NOT NULL,
            institutional_email TEXT NOT NULL UNIQUE,
            bio                 TEXT,
            expertise_tags      TEXT NOT NULL DEFAULT '["CS"]',
            verified_at         TIMESTAMP,
            revoked_at          TIMESTAMP,
            revoked_by          INTEGER,
            revoke_reason       TEXT,
            FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (revoked_by)  REFERENCES users(id) ON DELETE SET NULL
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewers_status ON reviewers(application_status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewers_institution ON reviewers(institution_domain)')

    # Index on submissions.review_status for fast admin-queue filters.
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON submissions(review_status)')

    # Partial UNIQUE not needed: a submission has at most one review lifecycle
    # because the state lives in columns on the submission itself.
    # ----------------------------------------------------------------------
    # End Block 1 schema
    # ----------------------------------------------------------------------

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