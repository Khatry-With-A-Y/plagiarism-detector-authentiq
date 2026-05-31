import json
import re
import sqlite3
from pathlib import Path
from ...config import DATABASE_PATH

# Expected vocabulary for reviewers.application_status under the current schema.
# Kept in sync with the CREATE TABLE in init_database() below.
_EXPECTED_APPLICATION_STATUS_VALUES = frozenset({'pending', 'approved', 'rejected'})


def _extract_application_status_check_values(sql):
    """Return the set of literal values from a `CHECK(application_status IN (...))`
    clause inside a CREATE TABLE statement, or None if no such clause exists.

    The returned values are stripped of surrounding quotes and lowercased.
    Robust to extra whitespace and to quoted/unquoted-but-still-string literals.
    """
    if not sql:
        return None
    m = re.search(
        r"CHECK\s*\(\s*application_status\s+IN\s*\(([^)]*)\)\s*\)",
        sql,
        re.IGNORECASE,
    )
    if not m:
        return None
    inside = m.group(1)
    values = set()
    for tok in inside.split(','):
        v = tok.strip()
        if not v:
            continue
        # Strip a single matching pair of surrounding quotes (single or double).
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        values.add(v.lower())
    return values


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


def _migrate_users_status_check(conn):
    """Idempotent rebuild of the `users` table to extend the `status` CHECK
    to ('active','blocked','paused').

    Mirrors `_migrate_users_role_check`: if the current CREATE statement in
    sqlite_master already contains 'paused', the rebuild is skipped.
    Otherwise we rebuild the table inside BEGIN EXCLUSIVE, preserving
    rowids (thereby preserving all FK references pointing at users(id)).
    Existing rows keep their existing status values, so no data conversion
    is needed.

    See .junie/plans/decline-handling-implementation.md for the full design.
    """
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    if row is None:
        # users table not yet created — CREATE TABLE IF NOT EXISTS in
        # init_database() will create it with the expanded CHECK directly.
        return
    existing_sql = row['sql'] or ''
    if "'paused'" in existing_sql:
        # Already migrated; nothing to do.
        return

    print("Migrating users.status CHECK to include 'paused' (idempotent rebuild)...")
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
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked', 'paused')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute(f'INSERT INTO users_new ({col_list}) SELECT {col_list} FROM users;')
        conn.execute('DROP TABLE users;')
        conn.execute('ALTER TABLE users_new RENAME TO users;')
        conn.execute('COMMIT;')
        # Validate nothing broke.
        conn.execute('PRAGMA foreign_key_check;')
        print("users.status CHECK rebuild completed successfully.")
    except Exception as exc:
        try:
            conn.execute('ROLLBACK;')
        except sqlite3.OperationalError:
            pass
        print(f"users.status migration FAILED and was rolled back: {exc}")
        raise
    finally:
        conn.execute('PRAGMA foreign_keys=ON;')


def _migrate_reviewers_application_status_constraints(conn):
    """Normalize legacy `reviewers.application_status` constraints/triggers.

    Some older installs were created with status guards that reject
    `application_status='pending'` (or custom triggers that raise
    "Invalid application_status"). Other installs were created with a richer
    legacy vocabulary such as
    ``('pending_initial','pending_reverification','approved','rejected','paused')``.
    Current reviewer apply flow always writes `pending`, so any stale guard
    that does not contain *exactly* the current vocabulary breaks submissions
    with `CHECK constraint failed: application_status IN (...)`.

    Idempotent behavior:
      - If the table CHECK is *exactly* ('pending','approved','rejected') and
        no legacy trigger is present, this is a no-op.
      - If only legacy trigger(s) are present, drop those trigger(s).
      - If the table CHECK is legacy/incompatible, rebuild `reviewers` with
        the current schema and migrate rows, coercing legacy statuses to the
        current vocabulary (`pending_initial` / `pending_reverification` /
        `submitted` → `pending`; `paused` → `approved`; anything else
        unknown → `pending`).
    """
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='reviewers'"
    ).fetchone()
    if row is None:
        return

    existing_sql = row['sql'] or ''
    existing_status_values = _extract_application_status_check_values(existing_sql)
    # The schema is considered current only when the CHECK list is *exactly*
    # the expected vocabulary. A loose substring check (the previous heuristic)
    # was buggy because `'pending'` is a substring of legacy values such as
    # `'pending_initial'` / `'pending_reverification'`, which caused stale
    # schemas to be misclassified as current and INSERTs of `'pending'` to
    # fail the legacy CHECK at runtime.
    has_expected_status_check = existing_status_values == _EXPECTED_APPLICATION_STATUS_VALUES

    trigger_rows = cursor.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='reviewers'"
    ).fetchall()
    legacy_triggers = []
    for trig in trigger_rows:
        trig_sql = (trig['sql'] or '').lower()
        if 'application_status' not in trig_sql:
            continue
        if 'invalid application_status' in trig_sql or "'pending'" not in trig_sql:
            legacy_triggers.append(trig['name'])

    if has_expected_status_check and not legacy_triggers:
        return

    def _drop_legacy_triggers():
        for trig_name in legacy_triggers:
            safe_name = trig_name.replace('"', '""')
            conn.execute(f'DROP TRIGGER IF EXISTS "{safe_name}"')

    if has_expected_status_check and legacy_triggers:
        print("Dropping legacy reviewers application_status trigger(s)...")
        try:
            conn.execute('BEGIN IMMEDIATE;')
            _drop_legacy_triggers()
            conn.execute('COMMIT;')
        except Exception:
            try:
                conn.execute('ROLLBACK;')
            except sqlite3.OperationalError:
                pass
            raise
        return

    print("Migrating reviewers.application_status constraints to current policy...")
    conn.execute('PRAGMA foreign_keys=OFF;')
    try:
        conn.execute('BEGIN EXCLUSIVE;')
        _drop_legacy_triggers()

        conn.execute('''
            CREATE TABLE reviewers_new (
                user_id                         INTEGER PRIMARY KEY,
                application_status              TEXT NOT NULL DEFAULT 'pending'
                                                CHECK(application_status IN ('pending','approved','rejected')),
                submitted_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at                     TIMESTAMP,
                reviewed_by                     INTEGER,
                decision_reason                 TEXT,
                institution_domain              TEXT NOT NULL,
                institution_name                TEXT,
                affiliation                     TEXT NOT NULL,
                institutional_email             TEXT NOT NULL UNIQUE,
                bio                             TEXT,
                expertise_tags                  TEXT NOT NULL DEFAULT '["CS"]',
                verified_at                     TIMESTAMP,
                revoked_at                      TIMESTAMP,
                revoked_by                      INTEGER,
                revoke_reason                   TEXT,
                email_verified                  INTEGER NOT NULL DEFAULT 0,
                email_verified_at               TIMESTAMP,
                email_verification_token_hash   TEXT,
                email_verification_expires_at   TIMESTAMP,
                last_verification_sent_at       TIMESTAMP,
                verification_sent_count         INTEGER NOT NULL DEFAULT 0,
                verification_window_started_at  TIMESTAMP,
                paused_at                       TIMESTAMP,
                paused_by                       INTEGER,
                paused_reason                   TEXT,
                paused_until                    TIMESTAMP,
                last_pause_eval_at              TIMESTAMP,
                FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (revoked_by)  REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (paused_by)   REFERENCES users(id) ON DELETE SET NULL
            )
        ''')

        old_cols = [c['name'] for c in conn.execute("PRAGMA table_info(reviewers)").fetchall()]
        ordered_cols = [
            'user_id',
            'application_status',
            'submitted_at',
            'reviewed_at',
            'reviewed_by',
            'decision_reason',
            'institution_domain',
            'institution_name',
            'affiliation',
            'institutional_email',
            'bio',
            'expertise_tags',
            'verified_at',
            'revoked_at',
            'revoked_by',
            'revoke_reason',
            'email_verified',
            'email_verified_at',
            'email_verification_token_hash',
            'email_verification_expires_at',
            'last_verification_sent_at',
            'verification_sent_count',
            'verification_window_started_at',
            'paused_at',
            'paused_by',
            'paused_reason',
            'paused_until',
            'last_pause_eval_at',
        ]
        insert_cols = [c for c in ordered_cols if c in old_cols]
        if insert_cols:
            select_exprs = []
            for col in insert_cols:
                if col == 'application_status':
                    # Coerce any legacy vocabulary into the current one.
                    #   * `pending_initial` / `pending_reverification` / `submitted`
                    #     → `pending`  (these all represent an in-flight application).
                    #   * `paused` → `approved` (paused reviewers were previously
                    #     approved; their pause state is carried by `paused_at`).
                    #   * anything else unknown → `pending` (safe default — the
                    #     applicant can be re-reviewed by an admin).
                    select_exprs.append(
                        "CASE "
                        "WHEN application_status IN ('pending','approved','rejected') THEN application_status "
                        "WHEN application_status IN ('pending_initial','pending_reverification','submitted') THEN 'pending' "
                        "WHEN application_status = 'paused' THEN 'approved' "
                        "ELSE 'pending' END AS application_status"
                    )
                else:
                    select_exprs.append(col)

            conn.execute(
                f"INSERT INTO reviewers_new ({', '.join(insert_cols)}) "
                f"SELECT {', '.join(select_exprs)} FROM reviewers"
            )

        conn.execute('DROP TABLE reviewers;')
        conn.execute('ALTER TABLE reviewers_new RENAME TO reviewers;')
        conn.execute('COMMIT;')
        conn.execute('PRAGMA foreign_key_check;')
        print("reviewers.application_status migration completed successfully.")
    except Exception as exc:
        try:
            conn.execute('ROLLBACK;')
        except sqlite3.OperationalError:
            pass
        print(f"reviewers.application_status migration FAILED and was rolled back: {exc}")
        raise
    finally:
        conn.execute('PRAGMA foreign_keys=ON;')


def init_database():
    """Initialize the database with all required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create users table (NEW installs get the expanded CHECK; EXISTING installs
    # are migrated by _migrate_users_role_check + _migrate_users_status_check below).
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('user', 'reviewer', 'admin')),
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked', 'paused')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    # Idempotent migration: if an older `users` table exists with CHECK
    # limited to ('user','admin'), rebuild it to add 'reviewer'. Safe to
    # re-run; no-op once the CHECK already contains 'reviewer'.
    _migrate_users_role_check(conn)

    # Idempotent migration (decline-handling): widen the status CHECK to
    # include 'paused' for the reviewer auto-pause accountability layer.
    # See .junie/plans/decline-handling-implementation.md.
    _migrate_users_status_check(conn)

    # Check if status column exists, add it if not (migration)
    cursor.execute("PRAGMA table_info(users)")
    columns = [col['name'] for col in cursor.fetchall()]
    if 'status' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('active', 'blocked', 'paused'))")

    # Migration: profile fields — avatar_url and bio
    if 'avatar_url' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        print("Added avatar_url column to users table")
    if 'bio' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT")
        print("Added bio column to users table")

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

    # Migration: peer-review provenance columns on papers. Review requests
    # live on `submissions`; a promoted paper links back via `submission_id`
    # to retain provenance without a separate review_requests table.
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

    # Migration: peer-review fields absorbed into submissions. A submission
    # is the review request; `review_status` discriminates (NULL = no review
    # requested). CHECK constraints live in the API layer since SQLite's
    # ALTER TABLE ADD COLUMN cannot attach them.
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
    if 'processing_started_at' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN processing_started_at TIMESTAMP")
        print("Added processing_started_at column to submissions table")
    if 'processing_completed_at' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN processing_completed_at TIMESTAMP")
        print("Added processing_completed_at column to submissions table")
    if 'processing_failed_at' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN processing_failed_at TIMESTAMP")
        print("Added processing_failed_at column to submissions table")
    if 'processing_error' not in submission_columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN processing_error TEXT")
        print("Added processing_error column to submissions table")
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
        # 'pass' or 'fail' — final panel tally, only written once every
        # active reviewer has voted and the panel transitions to
        # 'awaiting_admin'.
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
    if 'pool_breakdown' not in submission_columns:
        # JSON dict written by `Submission.assign_many` when the pool flips
        # to `insufficient_pool`; stored so the admin queue can render the
        # breakdown without re-running assignment.
        cursor.execute("ALTER TABLE submissions ADD COLUMN pool_breakdown TEXT")
        print("Added pool_breakdown column to submissions table")
    
    # Create similarity_results table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS similarity_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            paper_id INTEGER NOT NULL,
            similarity_score REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
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

    # Peer-review & reviewer-role schema (one-table design). All peer-review
    # data lives in `users`, `submissions`, `papers`, and `reviewers`.
    # Corpus cache invalidation is handled in-process via `CorpusCache.invalidate()`
    # with a 60-second TTL backstop (sufficient for single-process Flask).

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

    # Idempotent migration for legacy installs that still reject
    # application_status='pending' (table CHECK and/or trigger-based guards).
    _migrate_reviewers_application_status_constraints(conn)

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewers_status ON reviewers(application_status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewers_institution ON reviewers(institution_domain)')

    # ----------------------------------------------------------------------
    # Reviewer invitation (admin -> expert) table.
    # ----------------------------------------------------------------------
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviewer_invites (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id       INTEGER NOT NULL,
            institutional_email TEXT NOT NULL,
            token_hash          TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','consumed','expired','revoked')),
            expires_at          TIMESTAMP,
            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            sent_at             TIMESTAMP,
            consumed_at         TIMESTAMP,
            invited_by          INTEGER,
            consumed_by         INTEGER,
            send_count          INTEGER NOT NULL DEFAULT 0,
            last_sent_at        TIMESTAMP,
            last_notified_at    TIMESTAMP,
            institution_domain  TEXT,
            institution_name    TEXT,
            UNIQUE(submission_id, institutional_email),
            FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (consumed_by) REFERENCES users(id) ON DELETE SET NULL
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewer_invites_submission ON reviewer_invites(submission_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewer_invites_email ON reviewer_invites(institutional_email)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewer_invites_status ON reviewer_invites(status)')

    # ----------------------------------------------------------------------
    # Migration: institutional-email verification (reviewers role)
    # ----------------------------------------------------------------------
    # Adds 4 nullable columns to `reviewers` so a reviewer applicant must
    # prove ownership of the institutional mailbox before an admin can
    # approve. Existing approved rows are backfilled as already-verified so
    # the demo seed and any pre-existing approvals remain consistent.
    # Columns:
    #   - email_verified                  INTEGER NOT NULL DEFAULT 0
    #   - email_verified_at               TIMESTAMP
    #   - email_verification_token_hash   TEXT       (sha256, NULL after consume)
    #   - email_verification_expires_at   TIMESTAMP  (ISO, NULL after consume)
    # Note: any future flow that seeds approved reviewers directly must
    # remember to set email_verified=1 — the backfill below only catches
    # rows that already exist at migration time.
    cursor.execute("PRAGMA table_info(reviewers)")
    rev_cols = [col['name'] for col in cursor.fetchall()]
    if 'email_verified' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
        cursor.execute("UPDATE reviewers SET email_verified = 1 WHERE application_status = 'approved'")
        print("Added email_verified column to reviewers table")
    if 'email_verified_at' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN email_verified_at TIMESTAMP")
        cursor.execute(
            "UPDATE reviewers SET email_verified_at = verified_at "
            "WHERE application_status = 'approved' AND email_verified_at IS NULL"
        )
        print("Added email_verified_at column to reviewers table")
    if 'email_verification_token_hash' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN email_verification_token_hash TEXT")
        print("Added email_verification_token_hash column to reviewers table")
    if 'email_verification_expires_at' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN email_verification_expires_at TIMESTAMP")
        print("Added email_verification_expires_at column to reviewers table")

    # ----------------------------------------------------------------------
    # Migration: verification-link resend rate limiting
    # ----------------------------------------------------------------------
    # Adds 3 nullable columns to `reviewers` to throttle the "Resend
    # verification link" button so it can't be abused (mailbox flooding,
    # mailer cost, or spam-flagging the institutional domain).
    #
    # Columns:
    #   - last_verification_sent_at      TIMESTAMP  (UTC, last send)
    #   - verification_sent_count        INTEGER NOT NULL DEFAULT 0
    #   - verification_window_started_at TIMESTAMP  (UTC, start of the current 24h window)
    #
    # The model layer enforces:
    #   - a short per-send cooldown (60s)
    #   - a daily cap (5 sends per rolling 24h window)
    # The initial send from /apply also bumps the counter, so the user
    # can't get a 6th email simply by editing the email field repeatedly.
    if 'last_verification_sent_at' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN last_verification_sent_at TIMESTAMP")
        print("Added last_verification_sent_at column to reviewers table")
    if 'verification_sent_count' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN verification_sent_count INTEGER NOT NULL DEFAULT 0")
        print("Added verification_sent_count column to reviewers table")
    if 'verification_window_started_at' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN verification_window_started_at TIMESTAMP")
        print("Added verification_window_started_at column to reviewers table")

    # ----------------------------------------------------------------------
    # Migration: reviewer-decline accountability (auto-pause metadata)
    # ----------------------------------------------------------------------
    # Adds 5 nullable columns to `reviewers` mirroring the existing
    # `revoked_at`/`revoked_by`/`revoke_reason` triplet. Populated by the
    # auto-pause path in Submission.decline_assignment and the admin
    # manual pause/unpause endpoints. See
    # .junie/plans/decline-handling-implementation.md for the full design.
    #
    # Columns:
    #   - paused_at           TIMESTAMP   (set when auto- or manual-pause fires)
    #   - paused_by           INTEGER     (admin user id; NULL when auto-paused)
    #   - paused_reason       TEXT        ('auto:rolling_window_exceeded' or admin free-text)
    #   - paused_until        TIMESTAMP   (earliest possible auto-unpause)
    #   - last_pause_eval_at  TIMESTAMP   (anchor for the lazy sweep)
    if 'paused_at' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN paused_at TIMESTAMP")
        print("Added paused_at column to reviewers table")
    if 'paused_by' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN paused_by INTEGER")
        print("Added paused_by column to reviewers table")
    if 'paused_reason' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN paused_reason TEXT")
        print("Added paused_reason column to reviewers table")
    if 'paused_until' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN paused_until TIMESTAMP")
        print("Added paused_until column to reviewers table")
    if 'last_pause_eval_at' not in rev_cols:
        cursor.execute("ALTER TABLE reviewers ADD COLUMN last_pause_eval_at TIMESTAMP")
        print("Added last_pause_eval_at column to reviewers table")

    # Index on reviewers.paused_at for the lazy auto-unpause sweep.
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviewers_paused_at ON reviewers(paused_at)')

    # Index on submissions.review_status for fast admin-queue filters.
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON submissions(review_status)')

    # Partial UNIQUE not needed: a submission has at most one review lifecycle
    # because the state lives in columns on the submission itself.

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
