"""
test_assign_breakdown.py — Block 7 (Stage 7b)

Verifies that `Submission.assign_many` returns a structured `breakdown`
when it flips a submission to `insufficient_pool`, and that each
exclusion counter increments in the right scenario.

The test runs against a temporary SQLite DB seeded with a minimal schema
and a deterministic reviewer pool, then drives `assign_many` directly.
"""
import os
import sys
import json
import sqlite3
import tempfile
from pathlib import Path

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
sys.path.insert(0, root_dir)

import backend.app.utils.database as db_utils
import backend.config as config
from backend.app.models.models import Submission


def _seed_user(conn, uid, username, role='user', status='active'):
    conn.execute(
        "INSERT INTO users (id, username, email, password_hash, role, status) "
        "VALUES (?, ?, ?, 'x', ?, ?)",
        (uid, username, f'{username}@x.com', role, status)
    )


def _seed_reviewer(conn, uid, institution, expertise=None, approved=True):
    conn.execute(
        "INSERT INTO reviewers (user_id, application_status, institution_domain, "
        "institution_name, affiliation, institutional_email, expertise_tags) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (uid,
         'approved' if approved else 'pending',
         institution,
         institution,
         f'aff_{uid}',
         f'r{uid}@{institution}',
         json.dumps(expertise or ['CS']))
    )


def _seed_submission(conn, sub_id, owner_id, domain_tag='CS'):
    conn.execute(
        "INSERT INTO submissions (id, user_id, filename, file_path, status, "
        "domain_tag, review_status, review_votes) "
        "VALUES (?, ?, ?, ?, 'completed', ?, 'pending', '[]')",
        (sub_id, owner_id, f'sub_{sub_id}.pdf', f'/tmp/sub_{sub_id}.pdf', domain_tag)
    )


def _setup_temp_db():
    """Create a fresh temp DB with the full schema."""
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


def _run_assign_and_get_breakdown(submission_id):
    result = Submission.assign_many(submission_id)
    assert result['status'] == 'insufficient_pool', (
        f"Expected insufficient_pool, got {result}"
    )
    assert 'breakdown' in result, "breakdown missing from response"
    return result['breakdown']


def test_excluded_submitter_increments():
    """If the submitter is also a reviewer, breakdown.excluded_submitter == 1."""
    print("\n[TEST] excluded_submitter increments when submitter is a reviewer")
    test_path = _setup_temp_db()
    original = config.DATABASE_PATH
    try:
        # The submitter is also an approved reviewer — should be filtered out.
        conn = db_utils.get_db_connection()
        try:
            _seed_user(conn, 100, 'submitter', role='reviewer')
            _seed_reviewer(conn, 100, 'tu.edu.np')
            # 1 other reviewer — pool is too small (< MIN_REVIEWERS_PER_REQUEST=3).
            _seed_user(conn, 101, 'rev1', role='reviewer')
            _seed_reviewer(conn, 101, 'ku.edu.np')
            _seed_submission(conn, 5000, 100)
            conn.commit()
        finally:
            conn.close()

        b = _run_assign_and_get_breakdown(5000)
        assert b['excluded_submitter'] == 1, b
        assert b['excluded_same_institution'] == 0, b
        assert b['excluded_already_assigned'] == 0, b
        assert b['eligible_count'] == 1, b
        assert b['total_active_reviewers'] == 2, b
        print(f"  PASS: {b}")
    finally:
        config.DATABASE_PATH = original
        db_utils.DATABASE_PATH = original
        _teardown(test_path)


def test_excluded_same_institution_increments():
    """Reviewers at submitter's institution increment excluded_same_institution."""
    print("\n[TEST] excluded_same_institution increments")
    test_path = _setup_temp_db()
    original = config.DATABASE_PATH
    try:
        conn = db_utils.get_db_connection()
        try:
            # Submitter is a regular user with a reviewer profile carrying institution
            _seed_user(conn, 200, 'submitter')
            _seed_reviewer(conn, 200, 'tu.edu.np', approved=False)  # gives them an institution row
            # Two reviewers at same institution → both excluded.
            _seed_user(conn, 201, 'rev1', role='reviewer')
            _seed_reviewer(conn, 201, 'tu.edu.np')
            _seed_user(conn, 202, 'rev2', role='reviewer')
            _seed_reviewer(conn, 202, 'tu.edu.np')
            # One reviewer at a different institution → eligible (1 < 3 → insufficient).
            _seed_user(conn, 203, 'rev3', role='reviewer')
            _seed_reviewer(conn, 203, 'ku.edu.np')
            _seed_submission(conn, 5001, 200)
            conn.commit()
        finally:
            conn.close()

        b = _run_assign_and_get_breakdown(5001)
        assert b['excluded_same_institution'] == 2, b
        assert b['eligible_count'] == 1, b
        assert b['total_active_reviewers'] == 3, b   # only approved reviewers count
        print(f"  PASS: {b}")
    finally:
        config.DATABASE_PATH = original
        db_utils.DATABASE_PATH = original
        _teardown(test_path)


def test_excluded_already_assigned_increments():
    """Reviewers already in review_votes increment excluded_already_assigned."""
    print("\n[TEST] excluded_already_assigned increments")
    test_path = _setup_temp_db()
    original = config.DATABASE_PATH
    try:
        conn = db_utils.get_db_connection()
        try:
            _seed_user(conn, 300, 'submitter')
            _seed_reviewer(conn, 300, 'tu.edu.np', approved=False)
            # Two reviewers already in review_votes (declined).
            _seed_user(conn, 301, 'rev1', role='reviewer')
            _seed_reviewer(conn, 301, 'ku.edu.np')
            _seed_user(conn, 302, 'rev2', role='reviewer')
            _seed_reviewer(conn, 302, 'pu.edu.np')
            # Submission seeded with both as already declined (existing_active=0).
            existing_votes = [
                {'reviewer_id': 301, 'assignment_status': 'declined'},
                {'reviewer_id': 302, 'assignment_status': 'declined'},
            ]
            conn.execute(
                "INSERT INTO submissions (id, user_id, filename, file_path, status, "
                "domain_tag, review_status, review_votes) "
                "VALUES (?, ?, 'x.pdf', '/tmp/x.pdf', 'completed', 'CS', "
                "'insufficient_pool', ?)",
                (5002, 300, json.dumps(existing_votes))
            )
            conn.commit()
        finally:
            conn.close()

        b = _run_assign_and_get_breakdown(5002)
        assert b['excluded_already_assigned'] == 2, b
        assert b['eligible_count'] == 0, b
        print(f"  PASS: {b}")
    finally:
        config.DATABASE_PATH = original
        db_utils.DATABASE_PATH = original
        _teardown(test_path)


def test_excluded_expertise_mismatch_increments():
    """Reviewers without the matching expertise tag increment excluded_expertise_mismatch."""
    print("\n[TEST] excluded_expertise_mismatch increments")
    test_path = _setup_temp_db()
    original = config.DATABASE_PATH
    try:
        conn = db_utils.get_db_connection()
        try:
            _seed_user(conn, 400, 'submitter')
            _seed_reviewer(conn, 400, 'tu.edu.np', approved=False)
            # Two reviewers without 'CS' expertise.
            _seed_user(conn, 401, 'rev1', role='reviewer')
            _seed_reviewer(conn, 401, 'ku.edu.np', expertise=['MATH'])
            _seed_user(conn, 402, 'rev2', role='reviewer')
            _seed_reviewer(conn, 402, 'pu.edu.np', expertise=['BIO'])
            _seed_submission(conn, 5003, 400, domain_tag='CS')
            conn.commit()
        finally:
            conn.close()

        b = _run_assign_and_get_breakdown(5003)
        assert b['excluded_expertise_mismatch'] == 2, b
        assert b['eligible_count'] == 0, b
        print(f"  PASS: {b}")
    finally:
        config.DATABASE_PATH = original
        db_utils.DATABASE_PATH = original
        _teardown(test_path)


if __name__ == '__main__':
    test_excluded_submitter_increments()
    test_excluded_same_institution_increments()
    test_excluded_already_assigned_increments()
    test_excluded_expertise_mismatch_increments()
    print("\nAll Block 7 (Stage 7b) breakdown tests PASSED.")
