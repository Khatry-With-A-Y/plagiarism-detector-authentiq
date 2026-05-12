"""
seed_demo_data.py — one-command, idempotent demo seed.

Creates a viva-ready dataset:
  - Reuses the legacy `admin` user (auto-seeded by `init_database`)
  - 12 reviewers          across 4 institutions (KU / PU / IoE / TU)
  - 5 regular users

Demo accounts use Nepali names (ram, sita, hari, ...) so the dataset
reads naturally in the local-context viva.

Why 12 reviewers?
  The peer-review assignment policy picks `REVIEWERS_PER_REQUEST = 5`
  reviewers up front (see `backend/config.py`). When a reviewer
  declines, `Submission.decline_assignment` calls `assign_many(..., 1)`
  to backfill — but that backfill needs *eligible candidates that are
  not already on the panel*. With only 5 reviewers in the entire DB,
  every reviewer is already on the panel after the initial pick, so
  the backfill query returns zero rows and the submission instantly
  flips to `insufficient_pool`. Seeding 12 reviewers gives the
  backfill a comfortable buffer (7 spares after the initial 5-pick),
  enough to demonstrate auto-replacement through several chained
  declines without the panel collapsing. Spreading them across 4
  institutions also lets demos exercise the same-institution
  exclusion path when the submitter themselves is a reviewer.

Run:
    python scripts/seed_demo_data.py

Idempotency:
  - Users are upserted by `username` (skip-if-exists, password reset).
  - Reviewer profiles are upserted by `user_id` (ON CONFLICT DO UPDATE).
  - Re-running this script wipes nothing — it only refreshes the
    seeded rows. Safe to run before every demo.

This script writes only to `users`, `reviewers`.
It NEVER deletes other rows.
"""

import importlib.util
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "backend" / "data" / "database.db"

# Add backend to path so we can import models for password hashing
sys.path.insert(0, str(ROOT))

# Load config without booting flask
spec = importlib.util.spec_from_file_location(
    "cfg", ROOT / "backend" / "config.py"
)
cfg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfg)


def _hash(password: str) -> str:
    """Hash a password using the same algorithm the app uses."""
    from backend.app.utils.auth import hash_password
    return hash_password(password)


# ---------------------------------------------------------------------------
# Seed plan
# ---------------------------------------------------------------------------
# All demo passwords are the username for friction-free demos.
# The legacy `admin / admin` account is auto-seeded by `init_database()`
# (see `backend/app/utils/database.py`) and reused here — no separate
# demo admin row.
#
# Cohort layout (12 reviewers across 4 institutions, 3 per institution):
#   KU  (Kathmandu University)      : ram,    sita,   manish
#   PU  (Pokhara University)        : hari,   dipesh, sunita
#   IoE (Institute of Engineering)  : gita,   bishnu, sushma
#   TU  (Tribhuvan University)      : nabin,  kabita, suman
# This gives `assign_many` a 7-reviewer backfill buffer beyond the
# initial 5-pick, enough to absorb several chained declines before
# the submission flips to `insufficient_pool`.
DEMO_USERS = [
    # username,    email,                  role,       password
    # 12 reviewers across 4 institutions
    # Kathmandu University (KU)
    ("ram",        "ram@ku.edu.np",        "reviewer", "ram"),
    ("sita",       "sita@ku.edu.np",       "reviewer", "sita"),
    ("manish",     "manish@ku.edu.np",     "reviewer", "manish"),
    # Pokhara University (PU)
    ("hari",       "hari@pu.edu.np",       "reviewer", "hari"),
    ("dipesh",     "dipesh@pu.edu.np",     "reviewer", "dipesh"),
    ("sunita",     "sunita@pu.edu.np",     "reviewer", "sunita"),
    # Institute of Engineering (IoE)
    ("gita",       "gita@ioe.edu.np",      "reviewer", "gita"),
    ("bishnu",     "bishnu@ioe.edu.np",    "reviewer", "bishnu"),
    ("sushma",     "sushma@ioe.edu.np",    "reviewer", "sushma"),
    # Tribhuvan University (TU)
    ("nabin",      "nabin@tu.edu.np",      "reviewer", "nabin"),
    ("kabita",     "kabita@tu.edu.np",     "reviewer", "kabita"),
    ("suman",      "suman@tu.edu.np",      "reviewer", "suman"),
    # 5 regular users
    ("krishna",    "krishna@example.com",  "user",     "krishna"),
    ("radha",      "radha@example.com",    "user",     "radha"),
    ("arjun",      "arjun@example.com",    "user",     "arjun"),
    ("prakash",    "prakash@example.com",  "user",     "prakash"),
    ("maya",       "maya@example.com",     "user",     "maya"),
]

REVIEWER_PROFILES = {
    # username:  (institution_domain, institution_name)
    "ram":       ("ku.edu.np",  "Kathmandu University"),
    "sita":      ("ku.edu.np",  "Kathmandu University"),
    "manish":    ("ku.edu.np",  "Kathmandu University"),
    "hari":      ("pu.edu.np",  "Pokhara University"),
    "dipesh":    ("pu.edu.np",  "Pokhara University"),
    "sunita":    ("pu.edu.np",  "Pokhara University"),
    "gita":      ("ioe.edu.np", "Institute of Engineering"),
    "bishnu":    ("ioe.edu.np", "Institute of Engineering"),
    "sushma":    ("ioe.edu.np", "Institute of Engineering"),
    "nabin":     ("tu.edu.np",  "Tribhuvan University"),
    "kabita":    ("tu.edu.np",  "Tribhuvan University"),
    "suman":     ("tu.edu.np",  "Tribhuvan University"),
}


# ---------------------------------------------------------------------------
# DB helpers (raw sqlite — keeps this script self-contained)
# ---------------------------------------------------------------------------
def _connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _ensure_user(conn, username, email, role, password):
    """Create user if missing; reset password+role for an existing demo row."""
    cur = conn.cursor()
    row = cur.execute(
        "SELECT id, role FROM users WHERE username=?", (username,)
    ).fetchone()
    if row is None:
        cur.execute(
            "INSERT INTO users (username, email, password_hash, role, status) "
            "VALUES (?, ?, ?, ?, 'active')",
            (username, email, _hash(password), role)
        )
        return cur.lastrowid, "created"
    # Refresh password + role idempotently.
    cur.execute(
        "UPDATE users SET email=?, password_hash=?, role=?, status='active' "
        "WHERE id=?",
        (email, _hash(password), role, row["id"])
    )
    return row["id"], "refreshed"


def _ensure_reviewer_profile(conn, user_id, username, domain, name, status):
    """Upsert into `reviewers`. status: 'approved' or 'pending'."""
    cur = conn.cursor()
    now = _now_utc()
    cur.execute("""
        INSERT INTO reviewers (
            user_id, application_status, submitted_at, reviewed_at, reviewed_by,
            decision_reason, institution_domain, institution_name,
            affiliation, institutional_email, bio, expertise_tags,
            verified_at, revoked_at, revoked_by, revoke_reason
        ) VALUES (
            :user_id, :application_status, :now, :reviewed_at, :reviewed_by,
            :decision_reason, :institution_domain, :institution_name,
            :affiliation, :institutional_email, :bio, :expertise_tags,
            :verified_at, NULL, NULL, NULL
        )
        ON CONFLICT(user_id) DO UPDATE SET
            application_status  = excluded.application_status,
            reviewed_at         = excluded.reviewed_at,
            reviewed_by         = excluded.reviewed_by,
            decision_reason     = excluded.decision_reason,
            institution_domain  = excluded.institution_domain,
            institution_name    = excluded.institution_name,
            affiliation         = excluded.affiliation,
            institutional_email = excluded.institutional_email,
            bio                 = excluded.bio,
            expertise_tags      = excluded.expertise_tags,
            verified_at         = excluded.verified_at,
            revoked_at          = NULL,
            revoked_by          = NULL,
            revoke_reason       = NULL
    """, {
        "user_id":             user_id,
        "application_status":  status,
        "now":                 now,
        "reviewed_at":         now if status == "approved" else None,
        "reviewed_by":         1 if status == "approved" else None,
        "decision_reason":     "Seeded demo reviewer" if status == "approved" else None,
        "institution_domain":  domain,
        "institution_name":    name,
        "affiliation":         f"Demo reviewer ({username})",
        "institutional_email": f"{username}@{domain}",
        "bio":                 (f"Demo reviewer at {name}. "
                                "Seeded for end-to-end peer-review demo."),
        "expertise_tags":      json.dumps(["CS"]),
        "verified_at":         now if status == "approved" else None,
    })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 70)
    print("Authentiq — demo data seed")
    print("=" * 70)
    if not DB_PATH.exists():
        print(f"!! Database not found at {DB_PATH}.", file=sys.stderr)
        print("   Run the backend at least once to initialise the schema:", file=sys.stderr)
        print("       python backend/run_backend.py", file=sys.stderr)
        sys.exit(1)

    conn = _connect()
    try:
        conn.execute("BEGIN IMMEDIATE")

        # 1. Users (12 reviewers + 5 regular users)
        user_ids = {}
        for username, email, role, pw in DEMO_USERS:
            uid, action = _ensure_user(conn, username, email, role, pw)
            user_ids[username] = uid
            print(f"  user {username:<10} -> id={uid:<3} [{action}]")

        # 2. Reviewer profiles (approved)
        for username, (domain, name) in REVIEWER_PROFILES.items():
            _ensure_reviewer_profile(
                conn, user_ids[username], username, domain, name, "approved"
            )
            print(f"  reviewer profile {username:<10} -> {name} ({domain})")

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"\n!! Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

    print("\n" + "=" * 70)
    print("Demo credentials (password = username)")
    print("=" * 70)
    print(f"  Admin       : admin / admin                       (legacy account, reused)")
    print(f"  Reviewers   : ram, sita, manish                    (KU  — Kathmandu University)")
    print(f"                hari, dipesh, sunita                 (PU  — Pokhara University)")
    print(f"                gita, bishnu, sushma                 (IoE — Institute of Engineering)")
    print(f"                nabin, kabita, suman                 (TU  — Tribhuvan University)")
    print(f"  Users       : krishna, radha, arjun, prakash, maya")
    print()
    print("Pool sizing: 12 reviewers / 4 institutions gives `assign_many`")
    print("a 7-reviewer backfill buffer beyond the initial 5-pick — enough")
    print("to demo decline → auto-replacement through several chained declines.")
    print()
    print("Done. Re-run anytime — the script is idempotent.")


if __name__ == "__main__":
    main()
