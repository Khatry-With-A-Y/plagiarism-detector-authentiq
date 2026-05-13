from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PAN_ROOT_DEFAULT = PROJECT_ROOT / "pan-plagiarism-corpus-2011"
EXTERNAL_CORPUS_DIR_DEFAULT = PAN_ROOT_DEFAULT / "external-detection-corpus"
SOURCE_DOC_DIR_DEFAULT = EXTERNAL_CORPUS_DIR_DEFAULT / "source-document"
SUSPICIOUS_DOC_DIR_DEFAULT = EXTERNAL_CORPUS_DIR_DEFAULT / "suspicious-document"

ARTIFACTS_DIR = PROJECT_ROOT / "backend" / "benchmark" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

MANIFEST_DB_DEFAULT = ARTIFACTS_DIR / "pan_manifest.db"
MANIFEST_CSV_DEFAULT = ARTIFACTS_DIR / "pan_manifest_cases.csv"
SPLIT_JSON_DEFAULT = ARTIFACTS_DIR / "pan_split.json"

# Variant → n-gram sizes used during preprocessing.
# IMPORTANT: "B2T3" exactly mirrors the production preprocessing path
# (TextProcessor.preprocess_for_tfidf → bigrams + trigrams only).
# Use "B2T3" for benchmarks that measure the same algorithm as production.
VARIANT_NGRAMS = {
    "B2T3": (2, 3),      # Production-equivalent: bigrams + trigrams (matches preprocess_for_tfidf)
    "U1": (1,),
    "U1B2": (1, 2),
    "U1B2T3": (1, 2, 3),
}

DEFAULT_DEV_RATIO = 0.20
DEFAULT_RANDOM_SEED = 42
DEFAULT_TOP_K = 10
DEFAULT_TOP_N_FOR_SPANS = 3
DEFAULT_SENTENCE_MATCH_THRESHOLD = 0.30

DEFAULT_MAX_PER_STRATUM = 300
# Source document word cap used during cache build.  Keeps index size manageable by truncating
# very long source documents before tokenization.
DEFAULT_MAX_WORDS = 500
# Suspicious document word cap used during run_benchmark.  Set to None (no truncation) so that
# plagiarised spans deep in the document are not missed.  96% of PAN spans start after char
# offset 2000 (≈word 400), so truncating at 500 words eliminates virtually all retrievable signal.
DEFAULT_QUERY_MAX_WORDS = None
# min_df=10 drops bigrams/trigrams appearing in fewer than 10 source docs.
# For B2T3 (the production-equivalent variant) this reduces a ~5M-term raw vocab to ~20k
# highly useful terms, which is far better than capping with max_vocab (which used to keep
# only the 50k RAREST terms — a bug that drove Hit@1 to zero).
DEFAULT_MIN_DF = 10
DEFAULT_MAX_DF = 0.95
# max_vocab=None lets min_df do the work.  Explicitly passing --max-vocab on the CLI still
# works, but the default no longer aggressively limits the vocabulary.
DEFAULT_MAX_VOCAB = None

