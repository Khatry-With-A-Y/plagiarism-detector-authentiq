import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Data directories (contains database, raw/processed papers, etc.)
DATA_DIR = BASE_DIR / "backend" / "data"

# Database configuration
DATABASE_PATH = DATA_DIR / "database.db"

# File upload configuration
# submissions will go into the "processed" folder, corpus papers to "raw_papers"
UPLOAD_FOLDER = DATA_DIR / "processed"
CORPUS_FOLDER = DATA_DIR / "raw_papers"
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
ALLOWED_EXTENSIONS = {'.txt', '.pdf', '.doc', '.docx'}

# JWT configuration
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Flask configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'

# CORS configuration
CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173']  # React dev servers

# ---------------------------------------------------------------------------
# Peer-review / Reviewer-role configuration (Block 1: schema + constants)
# See .junie/plans/add-reviewer-role-and-peer-review.md
# ---------------------------------------------------------------------------

# Institutional-email allowlist. Matching is case-insensitive and uses a
# suffix-with-dot-boundary check (e.g., 'student.tu.edu.np' matches 'tu.edu.np').
# Each entry is a tuple of (name, domain). Seeded into the `institutions`
# table on every init_database() run via an upsert (see database.py).
ALLOWED_INSTITUTION_DOMAINS = [
    # Nepal
    ('Tribhuvan University', 'tu.edu.np'),
    ('Kathmandu University', 'ku.edu.np'),
    ('Pokhara University', 'pu.edu.np'),
    ('Institute of Medicine', 'iom.edu.np'),
    ('Institute of Engineering', 'ioe.edu.np'),
    ('Patan Multiple Campus', 'pcampus.edu.np'),
    # International (for cross-border reviewer participation)
    ('Massachusetts Institute of Technology', 'mit.edu'),
    ('Stanford University', 'stanford.edu'),
    ('University of Oxford', 'ox.ac.uk'),
    ('University of Cambridge', 'cam.ac.uk'),
    ('Harvard University', 'harvard.edu'),
    ('Nanyang Technological University', 'ntu.edu.sg'),
    ('National University of Singapore', 'nus.edu.sg'),
]

# Review-request eligibility thresholds.
# A submission is eligible for peer review iff
#   max(doc_score) < REVIEW_ELIGIBILITY_UPPER
# AND max(sentence_score) < REVIEW_ELIGIBILITY_UPPER.
# REVIEW_ELIGIBILITY_LOWER is reserved for P1 band-based auto-enrollment.
REVIEW_ELIGIBILITY_THRESHOLD = 0.20   # alias retained for legacy references
REVIEW_ELIGIBILITY_UPPER = 0.20
REVIEW_ELIGIBILITY_LOWER = 0.05

# Reviewer assignment sizing and quorum.
REVIEWERS_PER_REQUEST = 5
MIN_REVIEWERS_PER_REQUEST = 3  # MUST be odd; majority-of-N only works cleanly when N is odd

# Accept/Decline/Vote deadline window for a reviewer.
REVIEW_DEADLINE_HOURS = 72

# Collusion mitigation toggle. Default True; flip to False only in small-pool
# demos. Assignments that bypass the institution filter are recorded with
# conflict_flag=1 on review_assignments for admin transparency.
STRICT_INSTITUTION_EXCLUSION = True

# Domain tag catalog (P0 = single tag). Enforced via CHECK on submissions.domain_tag.
DOMAIN_TAGS = ['CS']

# Structured fail-reason checklist. Any 'fail_reasons' payload must be a subset.
FAIL_REASON_TAXONOMY = [
    'suspected_paraphrase',
    'insufficient_citation',
    'low_content_quality',
    'out_of_scope',
    'other',
]

# Vote comment length policy.
FAIL_COMMENT_MIN_LEN = 20
COMMENT_MAX_LEN = 1000
BIO_MAX_LEN = 2000

# Deterministic assignment hook for tests. When set (e.g.,
# ASSIGNMENT_TEST_SEED=12345), assign_many's ORDER BY RANDOM() is replaced
# by a seeded stable ordering so tests are reproducible. Do NOT set in prod.
ASSIGNMENT_TEST_SEED = os.environ.get('ASSIGNMENT_TEST_SEED')  # None in prod
