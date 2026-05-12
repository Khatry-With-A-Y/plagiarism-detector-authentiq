# Vendored NLTK data

This directory holds the NLTK corpora the backend needs at runtime, so
that starting the backend (or running any test / ingest script) never
performs an `nltk.download(...)` call — no outbound traffic to
`raw.githubusercontent.com/nltk/nltk_data/...`, no broken-but-running
state on air-gapped machines, no surprise first-run delays.

`backend/app/utils/text_processing.py` calls
`nltk.data.path.insert(0, <this dir>)` at import time so NLTK looks here
before `~/nltk_data/` or any system-wide location.

## Layout

```
nltk_data/
└── corpora/
    ├── wordnet.zip       (≈ 10 MB)  ← required by WordNetLemmatizer
    └── omw-1.4.zip       (≈ 26 MB)  ← required by WordNet for lemma lookups
```

NLTK reads the zips in place via its `ZipFilePathPointer` — they are
intentionally **not** unzipped (unzipped, the same data is ~85 MB).

## Source

Both archives come from the official NLTK data repository:

- `https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip`
- `https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/omw-1.4.zip`

These are the exact artefacts `nltk.download('wordnet')` /
`nltk.download('omw-1.4')` would fetch.

## NLTK version pin

Captured against **nltk == 3.9.1** (the version pinned in
`backend/requirements.txt`). NLTK guarantees corpus-format stability
across minor versions, so the same files work for nltk 3.9.x; if you
ever bump the major NLTK version, re-verify by running the lemmatizer
spot-checks below.

## Refresh procedure (for maintainers only)

If the NLTK pin changes or one of the upstream files is updated:

```powershell
# from the repo root
Invoke-WebRequest `
  -Uri 'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip' `
  -OutFile 'backend\data\nltk_data\corpora\wordnet.zip'
Invoke-WebRequest `
  -Uri 'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/omw-1.4.zip' `
  -OutFile 'backend\data\nltk_data\corpora\omw-1.4.zip'
```

Then sanity-check (must print `ok`):

```powershell
python -c "import nltk; nltk.data.path.insert(0, 'backend/data/nltk_data'); nltk.data.find('corpora/wordnet/'); nltk.data.find('corpora/omw-1.4/'); from nltk.stem import WordNetLemmatizer; l = WordNetLemmatizer(); assert l.lemmatize('running', pos='v') == 'run'; assert l.lemmatize('studies', pos='n') == 'study'; print('ok')"
```

## Do not delete

These files are committed to the repository on purpose (they are small
binary blobs; see `D5` in
`.junie/plans/remove-runtime-nltk-download.md`). If `git clean` /
sparse-checkout strips them, the backend will refuse to start and the
`RuntimeError` from `text_processing.py` will tell you exactly what to
restore (`git checkout -- backend/data/nltk_data`).
