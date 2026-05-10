"""
seed_demo_data.py — one-command, idempotent demo seed.

Creates a viva-ready dataset:
  - Reuses the legacy `admin` user (auto-seeded by `init_database`)
  - 5 reviewers           across 3 institutions (KU / PU / IoE)
  - 3 regular users       (one of which submits the demo submission)
  - 1 approved corpus paper
  - 1 review-eligible submission (low-similarity, status='completed',
    review_status='pending' so admin can drive the assign flow during demo)
  - 1 pending reviewer application

Demo accounts use Nepali names (ram, sita, hari, ...) so the dataset
reads naturally in the local-context viva.

Run:
    python scripts/seed_demo_data.py

Idempotency:
  - Users are upserted by `username` (skip-if-exists, password reset).
  - Reviewer profiles are upserted by `user_id` (ON CONFLICT DO UPDATE).
  - The corpus paper is upserted by `(title, author)`.
  - The demo submission is upserted by a stable `filename` marker.
  - Re-running this script wipes nothing — it only refreshes the
    seeded rows. Safe to run before every demo.

This script writes only to `users`, `reviewers`, `papers`, `submissions`.
It NEVER deletes other rows.
"""

import importlib.util
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "backend" / "data" / "database.db"
CORPUS_DIR = ROOT / "backend" / "data" / "corpus"
UPLOADS_DIR = ROOT / "backend" / "data" / "uploads"

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
DEMO_USERS = [
    # username,    email,                  role,       password
    # 5 reviewers across 3 institutions
    ("ram",        "ram@ku.edu.np",        "reviewer", "ram"),
    ("sita",       "sita@ku.edu.np",       "reviewer", "sita"),
    ("hari",       "hari@pu.edu.np",       "reviewer", "hari"),
    ("gita",       "gita@ioe.edu.np",      "reviewer", "gita"),
    ("bishnu",     "bishnu@ioe.edu.np",    "reviewer", "bishnu"),
    # 3 regular users
    ("krishna",    "krishna@example.com",  "user",     "krishna"),
    ("radha",      "radha@example.com",    "user",     "radha"),
    ("arjun",      "arjun@example.com",    "user",     "arjun"),
    # 1 pending applicant — applies during the demo / already on file
    ("binod",      "binod@tu.edu.np",      "user",     "binod"),
]

REVIEWER_PROFILES = {
    # username:  (institution_domain, institution_name)
    "ram":       ("ku.edu.np",  "Kathmandu University"),
    "sita":      ("ku.edu.np",  "Kathmandu University"),
    "hari":      ("pu.edu.np",  "Pokhara University"),
    "gita":      ("ioe.edu.np", "Institute of Engineering"),
    "bishnu":    ("ioe.edu.np", "Institute of Engineering"),
}

PENDING_APPLICATION = {
    "username":           "binod",
    "institution_domain": "tu.edu.np",
    "institution_name":   "Tribhuvan University",
    "affiliation":        "MSc Computer Science",
    "bio":                ("PhD candidate at TU with research interests in NLP "
                           "and academic-integrity systems. Open to reviewing "
                           "computer-science submissions across all subdomains."),
}

CORPUS_PAPER_TITLE  = "Demo: Foundations of Plagiarism Detection"
CORPUS_PAPER_AUTHOR = "Authentiq Demo Author"
CORPUS_PAPER_BODY = """\
This paper describes a representative demonstration corpus document used in
the Authentiq academic-integrity demo. It introduces the foundational ideas
behind n-gram based similarity, inverse document frequency weighting, and
cosine similarity over normalised lexical features. The chapter sketches the
pipeline followed by the system, including text extraction, sentence-level
preprocessing, and corpus-side caching. The intended use of this paper is as
a reference document against which student submissions are checked. A
detailed treatment of reference-section exclusion, sentence-level evidence,
and bibliographic detection follows in subsequent sections of the corpus.

References

[1] Salton, G. and Buckley, C. (1988). Term-weighting approaches in automatic
text retrieval. Information Processing and Management, 24(5):513-523.
[2] Manning, C., Raghavan, P., and Schutze, H. (2008). Introduction to
Information Retrieval. Cambridge University Press.
"""

DEMO_SUBMISSION_FILENAME = "demo_submission_seed.txt"
DEMO_SUBMISSION_BODY = """\
This is a seeded student submission that intentionally has low similarity
against the demo corpus document. It exists to drive the peer-review
workflow end-to-end: the user requests review, the admin assigns five
reviewers, the reviewers accept and vote, the admin promotes the paper, and
on the next similarity check the corpus contains the new document.

The text below is intentionally distinct from the seeded corpus so the
detector reports a low-similarity score, which is what makes the submission
review-eligible (the threshold is REVIEW_ELIGIBILITY_THRESHOLD in config).
"""


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


def _ensure_pending_application(conn, applicant_user_id):
    """Insert/update a pending reviewer application for the demo applicant."""
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO reviewers (
            user_id, application_status, submitted_at,
            institution_domain, institution_name, affiliation,
            institutional_email, bio, expertise_tags
        ) VALUES (
            :user_id, 'pending', :now,
            :domain, :name, :affiliation,
            :email, :bio, :tags
        )
        ON CONFLICT(user_id) DO UPDATE SET
            application_status  = 'pending',
            institution_domain  = excluded.institution_domain,
            institution_name    = excluded.institution_name,
            affiliation         = excluded.affiliation,
            institutional_email = excluded.institutional_email,
            bio                 = excluded.bio,
            expertise_tags      = excluded.expertise_tags,
            reviewed_at         = NULL,
            reviewed_by         = NULL,
            decision_reason     = NULL,
            verified_at         = NULL,
            revoked_at          = NULL,
            revoked_by          = NULL,
            revoke_reason       = NULL
    """, {
        "user_id":     applicant_user_id,
        "now":         _now_utc(),
        "domain":      PENDING_APPLICATION["institution_domain"],
        "name":        PENDING_APPLICATION["institution_name"],
        "affiliation": PENDING_APPLICATION["affiliation"],
        # institutional_email is UNIQUE — derive from the applicant's
        # username so re-runs and historical demo rows never collide.
        "email":       (f"{PENDING_APPLICATION['username']}@"
                        f"{PENDING_APPLICATION['institution_domain']}"),
        "bio":         PENDING_APPLICATION["bio"],
        "tags":        json.dumps(["CS"]),
    })


def _ensure_corpus_paper(conn, admin_id):
    """Upsert the demo corpus paper. Computes preprocessed n-grams."""
    from backend.app.utils.text_processing import TextProcessor
    from backend.app.utils.reference_detector import ReferenceDetector

    # Make sure on-disk corpus location exists.
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    filename = "demo_corpus_seed.txt"
    file_path = CORPUS_DIR / filename
    file_path.write_text(CORPUS_PAPER_BODY, encoding="utf-8")

    main_content, reference_section = ReferenceDetector.split_content_and_references(
        CORPUS_PAPER_BODY
    )
    has_references = bool(reference_section)
    ngrams = TextProcessor.preprocess_for_tfidf(main_content) if main_content else []
    preprocessed = json.dumps(ngrams)

    cur = conn.cursor()
    row = cur.execute(
        "SELECT id FROM papers WHERE title=? AND author=?",
        (CORPUS_PAPER_TITLE, CORPUS_PAPER_AUTHOR)
    ).fetchone()
    if row is None:
        cur.execute("""
            INSERT INTO papers (
                title, author, filename, file_path, content_text,
                main_content, reference_section, has_references,
                preprocessed_ngrams, uploaded_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            CORPUS_PAPER_TITLE, CORPUS_PAPER_AUTHOR,
            filename, str(file_path), CORPUS_PAPER_BODY,
            main_content, reference_section, has_references,
            preprocessed, admin_id,
        ))
        return cur.lastrowid, "created"
    cur.execute("""
        UPDATE papers SET
            filename = ?, file_path = ?, content_text = ?,
            main_content = ?, reference_section = ?, has_references = ?,
            preprocessed_ngrams = ?, uploaded_by = ?
        WHERE id = ?
    """, (
        filename, str(file_path), CORPUS_PAPER_BODY,
        main_content, reference_section, has_references,
        preprocessed, admin_id, row["id"],
    ))
    return row["id"], "refreshed"


def _ensure_demo_submission(conn, submitter_id):
    """Upsert the review-eligible demo submission."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOADS_DIR / DEMO_SUBMISSION_FILENAME
    file_path.write_text(DEMO_SUBMISSION_BODY, encoding="utf-8")

    cur = conn.cursor()
    row = cur.execute(
        "SELECT id FROM submissions WHERE filename=?",
        (DEMO_SUBMISSION_FILENAME,)
    ).fetchone()
    if row is None:
        cur.execute("""
            INSERT INTO submissions (
                user_id, filename, file_path, status,
                domain_tag, review_status, review_votes,
                pass_votes, fail_votes
            ) VALUES (
                ?, ?, ?, 'completed', 'CS', 'pending', '[]', 0, 0
            )
        """, (submitter_id, DEMO_SUBMISSION_FILENAME, str(file_path)))
        return cur.lastrowid, "created"
    # Reset to a clean pending review state — drops any in-flight votes from
    # a previous demo so the next assignment cycle starts fresh.
    cur.execute("""
        UPDATE submissions SET
            user_id = ?,
            status = 'completed',
            domain_tag = 'CS',
            review_status = 'pending',
            review_votes = '[]',
            pass_votes = 0,
            fail_votes = 0,
            review_outcome = NULL,
            admin_decision = NULL,
            admin_decided_by = NULL,
            admin_decided_at = NULL,
            admin_decision_reason = NULL,
            pool_breakdown = NULL,
            file_path = ?
        WHERE id = ?
    """, (submitter_id, str(file_path), row["id"]))
    return row["id"], "refreshed"


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

        # 0. Look up the legacy admin user (auto-seeded by `init_database`).
        #    We reuse it as the corpus uploader rather than creating a
        #    separate `demo_admin` row, so the demo dataset stays minimal.
        admin_row = conn.execute(
            "SELECT id FROM users WHERE username='admin'"
        ).fetchone()
        if admin_row is None:
            raise RuntimeError(
                "Legacy 'admin' user is missing from the DB. "
                "Run `python backend/run_backend.py` once first so "
                "`init_database()` seeds it (admin / admin)."
            )
        admin_id = admin_row["id"]
        print(f"  reusing legacy admin user -> id={admin_id}")

        # 1. Users (5 reviewers + 3 users + 1 applicant)
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

        # 3. Pending application
        _ensure_pending_application(conn, user_ids["binod"])
        print(f"  pending application: binod @ "
              f"{PENDING_APPLICATION['institution_name']}")

        # 4. Corpus paper (uploaded by the legacy admin)
        paper_id, action = _ensure_corpus_paper(conn, admin_id)
        print(f"  corpus paper id={paper_id} [{action}]")

        # 5. Review-eligible demo submission (owned by 'krishna')
        submitter_id = user_ids["krishna"]
        sub_id, action = _ensure_demo_submission(conn, submitter_id)
        print(f"  demo submission id={sub_id} owner={submitter_id} [{action}]")

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
    print(f"  Admin       : admin / admin           (legacy account, reused)")
    print(f"  Reviewers   : ram, sita (KU)  hari (PU)  gita, bishnu (IoE)")
    print(f"  Users       : krishna, radha, arjun")
    print(f"  Applicant   : binod                  (pending reviewer application)")
    print()
    print("Seeded artifacts:")
    print(f"  corpus paper   : {CORPUS_PAPER_TITLE!r} by {CORPUS_PAPER_AUTHOR!r}")
    print(f"  demo submission: {DEMO_SUBMISSION_FILENAME} (owner=krishna, "
          "status=completed, review_status=pending)")
    print()
    print("Done. Re-run anytime — the script is idempotent.")


if __name__ == "__main__":
    main()
