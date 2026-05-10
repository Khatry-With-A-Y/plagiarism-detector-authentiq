"""
test_reviewer_revoke.py — Block 7 (Stage 7c)

Verifies that `Reviewer.revoke`:
  1. flips users.role back to 'user'
  2. stamps reviewers.revoked_at + revoked_by + revoke_reason
  3. sets reviewers.application_status = 'rejected'
  4. leaves any historical review_votes JSON untouched, so the embedded
     reviewer_snapshot remains queryable as the audit trail
"""
import os
import sys
import json
import tempfile
from pathlib import Path

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
sys.path.insert(0, root_dir)

import backend.app.utils.database as db_utils
import backend.config as config
from backend.app.models.models import Reviewer


def _setup_temp_db():
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    test_path = Path(path)
    config.DATABASE_PATH = test_path
    db_utils.DATABASE_PATH = test_path
    db_utils.init_database()
    return test_path


def _teardown(test_path):
    try:
        if test_path.exists():
            test_path.unlink()
    except Exception:
        pass


def test_revoke_full_audit_trail():
    """End-to-end: seed reviewer, seed historical assignment, revoke, assert."""
    print("\n[TEST] revoke flips role to 'user' and preserves audit snapshot")
    test_path = _setup_temp_db()
    original = config.DATABASE_PATH
    try:
        conn = db_utils.get_db_connection()
        try:
            # Seed a reviewer user + reviewer profile (approved).
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash, role) "
                "VALUES (?, ?, ?, 'x', 'reviewer')",
                (501, 'rev_alice', 'alice@ku.edu.np')
            )
            conn.execute(
                "INSERT INTO reviewers (user_id, application_status, "
                "institution_domain, institution_name, affiliation, "
                "institutional_email, expertise_tags, verified_at) "
                "VALUES (?, 'approved', 'ku.edu.np', 'KU', 'CS Faculty', "
                "'alice@ku.edu.np', ?, datetime('now'))",
                (501, json.dumps(['CS']))
            )
            # Seed an admin user (revoking actor).
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash, role) "
                "VALUES (?, ?, ?, 'x', 'admin')",
                (502, 'test_admin_502', 'admin502@x.com')
            )
            # Seed a submission with a historical review_votes entry (alice was
            # a reviewer at the time the snapshot was taken).
            historical_votes = [
                {
                    'assignment_id':     'aid-501',
                    'reviewer_id':       501,
                    'assignment_status': 'voted',
                    'vote':              'pass',
                    'comment':           'OK',
                    'reviewer_snapshot': {
                        'username':           'rev_alice',
                        'institution_domain': 'ku.edu.np',
                    },
                }
            ]
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash, role) "
                "VALUES (?, ?, ?, 'x', 'user')",
                (503, 'submitter', 'sub@x.com')
            )
            conn.execute(
                "INSERT INTO submissions (id, user_id, filename, file_path, "
                "status, review_status, review_votes) "
                "VALUES (?, ?, 'p.pdf', '/tmp/p.pdf', 'completed', "
                "'awaiting_admin', ?)",
                (8000, 503, json.dumps(historical_votes))
            )
            conn.commit()
        finally:
            conn.close()

        # --- Action ---
        Reviewer.revoke(501, 502, reason='Pattern of low-quality reviews')

        # --- Asserts ---
        conn = db_utils.get_db_connection()
        try:
            # 1. role flipped to 'user'
            r = conn.execute("SELECT role FROM users WHERE id=501").fetchone()
            assert r['role'] == 'user', f"expected 'user', got {r['role']!r}"

            # 2. revoked_at + revoked_by + reason stamped, status = rejected
            row = conn.execute(
                "SELECT revoked_at, revoked_by, revoke_reason, application_status "
                "FROM reviewers WHERE user_id=501"
            ).fetchone()
            assert row['revoked_at'] is not None, 'revoked_at not stamped'
            assert row['revoked_by'] == 502, row['revoked_by']
            assert row['revoke_reason'] == 'Pattern of low-quality reviews'
            assert row['application_status'] == 'rejected'

            # 3. historical review_votes JSON untouched — reviewer_snapshot
            #    is still queryable (this is the audit record).
            sub = conn.execute(
                "SELECT review_votes FROM submissions WHERE id=8000"
            ).fetchone()
            votes = json.loads(sub['review_votes'])
            assert len(votes) == 1
            entry = votes[0]
            assert entry['reviewer_id'] == 501
            assert entry['vote'] == 'pass'
            snap = entry['reviewer_snapshot']
            assert snap['username'] == 'rev_alice'
            assert snap['institution_domain'] == 'ku.edu.np'
        finally:
            conn.close()

        print("  PASS: role='user', revoked_at stamped, snapshot preserved.")
    finally:
        config.DATABASE_PATH = original
        db_utils.DATABASE_PATH = original
        _teardown(test_path)


if __name__ == '__main__':
    test_revoke_full_audit_trail()
    print("\nAll Block 7 (Stage 7c) revoke tests PASSED.")
