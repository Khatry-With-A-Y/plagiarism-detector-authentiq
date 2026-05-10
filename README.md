# Authentiq

> An n-gram + TF-IDF plagiarism-detection platform with a built-in **double-blind peer-review pipeline** that promotes accepted submissions back into the corpus.

Authentiq is a final-year-project full-stack web application. The detector
side is classical (TF-IDF over character/word n-grams + cosine similarity
over a precomputed corpus index). The peer-review side is the novel
contribution: when a low-similarity submission is flagged as a candidate
for the corpus, the platform runs it through a 5-reviewer panel with
72-hour deadlines, double-blind voting, and an admin-finalize promotion
pipeline. Approved submissions are added to the corpus with provenance
tags so the next similarity check picks them up.

---

## Highlights

- **Plagiarism detection** — n-gram TF-IDF + cosine similarity, sentence-level
  evidence, automatic reference-section exclusion (so bibliographies don't
  inflate scores).
- **Peer-review pipeline** — 5-reviewer panel, 72h deadline, accept /
  decline / lazy-expiry, automatic backfill, double-blind, anti-collusion
  filters (submitter / same-institution / already-assigned / expertise
  mismatch).
- **Admin finalize + Promotion Pipeline** — deterministic 6-step pipeline
  copies an approved submission into the corpus with `source='peer_reviewed'`,
  invalidates the in-process cache, next similarity request includes the
  new paper.
- **Submitter post-decision view** — pseudonymous `Reviewer 1..N` panel
  feedback, real identity stays admin-only.
- **Reviewer revocation + audit trail** — admin can revoke privileges; the
  embedded `reviewer_snapshot` keeps historical assignments queryable.
- **Insufficient-pool diagnostic** — when assignment fails, the admin
  queue shows *exactly why* (e.g. *"Only 2 eligible reviewers — 1
  same-institution conflict, 1 is the submitter."*).
- **Idempotent demo seed** — one command produces a viva-ready dataset
  (admin + 5 reviewers across 3 institutions + 3 users + 1 corpus paper +
  1 review-eligible submission + 1 pending application).

---

## Tech stack

### Frontend

| Library | Purpose |
|---|---|
| **React 18** (`react`, `react-dom`) | UI framework / component model |
| **React Router DOM 6** (`react-router-dom`) | Client-side routing |
| **Axios** (`axios`) | HTTP client (carries the JWT cookie to the API) |
| **react-scripts** (Create React App, dev only) | Dev server, build pipeline, Jest test runner |

### Backend

| Library | Purpose |
|---|---|
| **Python 3.11** | Runtime |
| **Flask** (`Flask`) | Web framework / routing layer |
| **Flask-Cors** (`Flask-Cors`) | CORS handling for the React dev server |
| **PyJWT** (`PyJWT`) | JWT issuing & verification (auth cookies) |
| **Werkzeug** / **Jinja2** / **itsdangerous** / **MarkupSafe** / **click** / **blinker** | Flask's standard runtime stack |
| **cryptography** / **cffi** / **pycparser** | Backing crypto primitives used by JWT / TLS |
| **requests** (`requests`) + **urllib3** / **certifi** / **idna** / **charset-normalizer** | Outbound HTTP (corpus download, fetch helpers) |
| **sqlite3** (stdlib) | Database driver |

### Document parsing & text extraction

| Library | Purpose |
|---|---|
| **PyMuPDF** (`PyMuPDF` / `fitz`) | PDF text extraction for uploads and corpus papers |
| **python-docx** (`python-docx`) | `.docx` text extraction |
| **docx2txt** (`docx2txt`) | Fallback `.docx` extraction for legacy files |
| **lxml** (`lxml`) | XML/HTML parsing backend used by `python-docx` |
| **Pillow** (`pillow`) | Image handling for PDF / DOCX assets |

### Detection pipeline

| Library | Purpose |
|---|---|
| **NLTK** (`nltk`) | Tokenization + stopword list (used by the preprocessor) |
| Custom n-gram + TF-IDF + cosine similarity | Implemented in `backend/app/utils/cosine.py` |
| `colorama` | Coloured CLI output for ingest / dataset-builder scripts |
| `typing_extensions` | Backport of typing helpers used across modules |

### Storage & auth

| Layer | Tech |
|---|---|
| Storage | SQLite (`backend/data/database.db`) + flat-file corpus (`backend/data/corpus/`) |
| Auth    | JWT in HttpOnly cookies; RBAC enforced via Flask decorators (`require_admin`, `require_reviewer`) |

---

## Setup

### Quick (Windows, recommended)

```powershell
.\setup.ps1
```

The script is idempotent: creates the venv, installs `requirements.txt`,
runs `npm ci` in `frontend/`, downloads the seed corpus PDFs (~1.2 GB) if
missing, initialises the SQLite schema, and ingests the seed corpus.

### Manual

```powershell
# Backend
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r ..\requirements.txt
python init_db.py
python app\utils\dataset_builder\ingest_papers.py   # optional, populates the seed corpus
cd ..
python backend\run_backend.py                       # starts the API on :5000

# Frontend (separate shell)
cd frontend
npm ci
npm start                                            # serves the SPA on :3000
```

> **`npm ci`, not `npm install`** — keeps everyone on the same lockfile.

### One-command demo seed

After the backend has initialised the DB at least once:

```powershell
python scripts\seed_demo_data.py
```

The script is idempotent — re-runs upsert the demo rows without
disturbing the rest of the DB.

### Corpus download (manual fallback)

If `setup.ps1`'s automatic corpus download failed:

1. Grab the bundle from the
   [GitHub Release](https://github.com/Khatry-With-A-Y/plagiarism-detector-authentiq/releases/tag/Authentiq-Raw-PDFs).
2. Extract into `backend/data/raw_papers/`.
3. `cd backend && python app/utils/dataset_builder/ingest_papers.py`
   (also idempotent — safely skips already-ingested papers).

---

## Demo credentials

> Password = username for every demo account. The legacy `admin / admin`
> account is auto-seeded by `init_db.py` and reused as the demo admin —
> the seed script does **not** create a separate admin row.

| Role        | Username   | Notes |
|---|---|---|
| Admin       | `admin`    | Legacy account (auto-seeded by `init_db.py`); reused |
| Reviewer    | `ram`      | Kathmandu University (`ku.edu.np`) |
| Reviewer    | `sita`     | Kathmandu University (`ku.edu.np`) |
| Reviewer    | `hari`     | Pokhara University (`pu.edu.np`) |
| Reviewer    | `gita`     | Institute of Engineering (`ioe.edu.np`) |
| Reviewer    | `bishnu`   | Institute of Engineering (`ioe.edu.np`) |
| User        | `krishna`  | Owns the seeded review-eligible submission |
| User        | `radha`    | — |
| User        | `arjun`    | — |
| Applicant   | `binod`    | TU; has a pending reviewer application |

---

## End-to-end demo

1. **Apply.** Log in as `binod`, click *Apply to be a Reviewer* (or just
   verify the pending application already exists).
2. **Approve.** Log in as `admin`, open *Reviewer Applications*, approve
   the applicant.
3. **Submit.** Log in as `krishna`, open the seeded submission, click
   *Request Peer Review*.
4. **Assign.** As `admin`, open *Peer Review Queue* and click *Assign*.
   Five reviewers across 3 institutions (`ram`, `sita`, `hari`, `gita`,
   `bishnu`) are picked.
5. **Review.** Log in as each reviewer (`ram` … `bishnu`) → *Accept* →
   vote *Pass* / *Fail* with optional comment + fail-reason chips.
6. **Decide.** Once majority is reached, as admin click *Approve*. The
   Promotion Pipeline runs — the submission becomes a `papers` row with
   `source='peer_reviewed'`.
7. **Verify.** Have `radha` upload a paraphrase. The new corpus paper
   appears in the similarity report (proves cache invalidation).
8. **Submitter view.** Log back in as `krishna`, open the submission —
   the *Reviewer Panel Feedback* section shows pseudonymous
   `Reviewer 1..N` cards with admin's decision.

---

## Configuration

`backend/config.py` (key tunables):

| Setting | Default | Meaning |
|---|---|---|
| `REVIEWERS_PER_REQUEST`        | 5     | Panel size |
| `MIN_REVIEWERS_PER_REQUEST`    | 3     | Quorum threshold |
| `REVIEW_DEADLINE_HOURS`        | 72    | Per-assignment deadline |
| `REVIEW_ELIGIBILITY_THRESHOLD` | 0.20  | Max similarity to be review-eligible |
| `STRICT_INSTITUTION_EXCLUSION` | True  | Anti-collusion filter on/off |
| `DECLINE_REASON_MAX_LEN`       | 500   | Max chars in decline reason |
| `DOMAIN_TAGS`                  | `['CS']` | Expertise taxonomy (single-tag) |

---

## Security & production caveats

- `JWT_SECRET_KEY` and `SECRET_KEY` in `backend/config.py` are
  **development defaults** — replace via env vars before any real deploy.
- File scanning, rate-limiting, HTTPS, and SMTP delivery for the existing
  `notifications` rows are out of scope. See
  [`docs/limitations-and-future-work.md`](docs/limitations-and-future-work.md).
- The single-process Flask deployment cannot be horizontally scaled
  without re-introducing a versioned cache counter (e.g. a `meta(key,value)`
  row or Redis `INCR`) so multiple workers can invalidate each other's
  in-process corpus cache.

---

## License

Educational use only.
