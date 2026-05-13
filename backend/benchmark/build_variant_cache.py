import argparse
import gzip
import math
import multiprocessing
import pickle
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from functools import partial
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.app.utils.tfidf import TFIDFCalculator  # noqa: E402
from backend.benchmark.config import ARTIFACTS_DIR, DEFAULT_MAX_DF, DEFAULT_MAX_VOCAB, DEFAULT_MAX_WORDS, DEFAULT_MIN_DF, MANIFEST_DB_DEFAULT, SOURCE_DOC_DIR_DEFAULT, VARIANT_NGRAMS  # noqa: E402
from backend.benchmark.ngrams import iter_text_files, preprocess_for_variant  # noqa: E402
from backend.benchmark.utils import read_text  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build source-side cache for a PAN benchmark variant.")
    parser.add_argument("--variant", choices=sorted(VARIANT_NGRAMS.keys()), required=True)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DOC_DIR_DEFAULT)
    parser.add_argument("--manifest-db", type=Path, default=MANIFEST_DB_DEFAULT)
    parser.add_argument(
        "--source-language",
        type=str,
        default=None,
        help="Optional source language filter using manifest metadata (e.g., en).",
    )
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--max-sources", type=int, default=None, help="Optional cap for smoke runs.")
    parser.add_argument("--max-words", type=int, default=None, help="Truncate each source document to this many words before tokenization (default: no cap).")
    parser.add_argument("--min-df", type=int, default=None, help="Drop terms appearing in fewer than N docs (default: no filter).")
    parser.add_argument("--max-df", type=float, default=None, help="Drop terms appearing in more than this fraction of docs (default: no filter).")
    parser.add_argument("--max-vocab", type=int, default=None, help="Keep at most N terms by IDF (lowest df first) after min/max-df filtering (default: no cap).")
    parser.add_argument("--jobs", type=int, default=multiprocessing.cpu_count(), help="Number of parallel jobs.")
    return parser.parse_args()


def compute_idf(df: Counter, doc_count: int) -> dict[str, float]:
    if doc_count <= 0:
        return {}
    return {term: math.log(doc_count / (1 + count)) for term, count in df.items()}


def prune_vocab(
    df: Counter,
    doc_count: int,
    min_df: int | None = None,
    max_df: float | None = None,
    max_vocab: int | None = None,
) -> Counter:
    """Prune the document-frequency Counter by min_df, max_df, and max_vocab."""
    pruned = df
    if min_df is not None or max_df is not None:
        max_doc_count = int(max_df * doc_count) if max_df is not None else doc_count
        min_doc_count = min_df if min_df is not None else 0
        pruned = Counter(
            {t: c for t, c in df.items() if c >= min_doc_count and c <= max_doc_count}
        )
    if max_vocab is not None and len(pruned) > max_vocab:
        # Keep terms with moderate-to-high df (highest df within the min/max window) —
        # these terms appear in many documents and therefore provide the best discriminative
        # signal for TF-IDF cosine matching.  Keeping the RAREST terms (lowest df, ascending
        # sort) was the previous bug: it filled the cache with hapaxes that never matched any
        # query term, driving Hit@1 to zero.
        pruned = Counter(dict(sorted(pruned.items(), key=lambda x: x[1], reverse=True)[:max_vocab]))
    return pruned


def _allowed_source_files(manifest_db: Path, source_language: str) -> set[str]:
    if not manifest_db.exists():
        raise FileNotFoundError(f"Manifest DB not found for language filtering: {manifest_db}")
    conn = sqlite3.connect(manifest_db)
    cursor = conn.cursor()
    rows = cursor.execute(
        """
        SELECT source_file
        FROM source_documents
        WHERE LOWER(language) = ?
        """,
        (source_language.lower(),),
    ).fetchall()
    conn.close()
    return {row[0] for row in rows}


def _worker_pass1(path, n_values, max_words=None):
    try:
        terms = preprocess_for_variant(read_text(path), n_values, max_words=max_words)
        if terms:
            return set(terms)
    except Exception:
        pass
    return None


def _worker_pass2(path, n_values, max_words=None):
    try:
        terms = preprocess_for_variant(read_text(path), n_values, max_words=max_words)
        if not terms:
            return None
        tf = TFIDFCalculator.compute_tf(terms)
        return path, tf
    except Exception:
        return None


def build_cache(
    variant: str,
    source_dir: Path,
    output: Path,
    max_sources: int | None,
    source_language: str | None,
    manifest_db: Path,
    jobs: int = 1,
    max_words: int | None = None,
    min_df: int | None = None,
    max_df: float | None = None,
    max_vocab: int | None = None,
) -> None:
    n_values = VARIANT_NGRAMS[variant]
    source_paths = list(iter_text_files(source_dir))

    if source_language:
        allowed_files = _allowed_source_files(manifest_db, source_language)
        source_paths = [path for path in source_paths if path.name in allowed_files]
        print(f"Language filter source_language={source_language}: kept {len(source_paths)} source docs")

    if max_sources:
        source_paths = source_paths[:max_sources]
    if not source_paths:
        raise FileNotFoundError(f"No source txt files found under: {source_dir}")

    started = time.perf_counter()
    df = Counter()
    valid_doc_count = 0

    if max_words:
        print(f"Document truncation: max_words={max_words}")

    # Pass 1: document frequencies
    print(f"Starting Pass 1 (IDF) with {jobs} jobs and {len(source_paths)} docs...")
    # Use chunksize to balance IPC overhead vs responsiveness
    chunksize = 20 if len(source_paths) > 1000 else 1

    with multiprocessing.Pool(processes=jobs) as pool:
        worker_fn = partial(_worker_pass1, n_values=n_values, max_words=max_words)
        for idx, unique_terms in enumerate(
            pool.imap_unordered(worker_fn, source_paths, chunksize=chunksize), start=1
        ):
            if unique_terms:
                df.update(unique_terms)
                valid_doc_count += 1
            if idx % 500 == 0 or idx == len(source_paths):
                print(f"[pass1] processed {idx}/{len(source_paths)} docs")

    vocab_before = len(df)
    if min_df is not None or max_df is not None or max_vocab is not None:
        df = prune_vocab(df, valid_doc_count, min_df=min_df, max_df=max_df, max_vocab=max_vocab)
        print(f"[pass1] vocab pruned: {vocab_before} -> {len(df)} terms (min_df={min_df}, max_df={max_df}, max_vocab={max_vocab})")
    idf = compute_idf(df, valid_doc_count)
    print(f"[pass1] valid docs={valid_doc_count}, vocab={len(idf)}")

    # Pass 2: postings + doc norms -> SQLite
    print(f"Starting Pass 2 (Postings) with {jobs} jobs...")
    
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
        
    conn = sqlite3.connect(output)
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    
    conn.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)")
    conn.execute("CREATE TABLE documents (id INTEGER PRIMARY KEY, source_file TEXT, rel_path TEXT, abs_path TEXT, norm REAL)")
    conn.execute("CREATE TABLE idf (term TEXT PRIMARY KEY, value REAL)")
    conn.execute("CREATE TABLE postings (term TEXT, doc_idx INTEGER, weight REAL)")

    metadata = {
        "variant": variant,
        "n_values": list(n_values),
        "source_dir": str(source_dir),
        "created_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "document_count": 0,
        "idf_term_count": len(idf),
    }

    # Insert IDF
    print("[pass2] inserting IDF...")
    conn.executemany("INSERT INTO idf VALUES (?, ?)", idf.items())

    documents_count = 0
    duplicate_name_count = 0
    seen_names: set[str] = set()
    postings_buffer = []
    # Parallel lists for CSR matrix construction (accumulated alongside SQLite writes)
    csr_rows: list[int] = []
    csr_cols: list[int] = []
    csr_data: list[float] = []
    csr_term_to_idx: dict[str, int] = {}
    # Per-doc norms (indexed by doc_idx) for meta file
    doc_norms_list: list[float] = []

    with multiprocessing.Pool(processes=jobs) as pool:
        worker_fn = partial(_worker_pass2, n_values=n_values, max_words=max_words)
        for idx, result in enumerate(
            pool.imap_unordered(worker_fn, source_paths, chunksize=chunksize), start=1
        ):
            if result:
                path, tf = result
                doc_idx = documents_count
                source_file = path.name
                if source_file in seen_names:
                    duplicate_name_count += 1
                seen_names.add(source_file)

                norm_sq = 0.0
                for term, tf_value in tf.items():
                    idf_value = idf.get(term, 0.0)
                    weight = tf_value * idf_value
                    if weight > 0:
                        postings_buffer.append((term, doc_idx, weight))
                        norm_sq += weight * weight
                        # Accumulate CSR triple
                        t_idx = csr_term_to_idx.setdefault(term, len(csr_term_to_idx))
                        csr_rows.append(t_idx)
                        csr_cols.append(doc_idx)
                        csr_data.append(weight)
                
                doc_norm = math.sqrt(norm_sq)
                doc_norms_list.append(doc_norm)
                conn.execute(
                    "INSERT INTO documents VALUES (?, ?, ?, ?, ?)",
                    (doc_idx, source_file, str(path.relative_to(source_dir)), str(path), doc_norm)
                )
                documents_count += 1

                if len(postings_buffer) >= 500000:
                    conn.executemany("INSERT INTO postings VALUES (?, ?, ?)", postings_buffer)
                    postings_buffer = []

            if idx % 500 == 0 or idx == len(source_paths):
                print(f"[pass2] processed {idx}/{len(source_paths)} docs")

    if postings_buffer:
        conn.executemany("INSERT INTO postings VALUES (?, ?, ?)", postings_buffer)

    print("[pass2] creating index on postings(term)...")
    conn.execute("CREATE INDEX idx_postings_term ON postings(term)")
    
    metadata["document_count"] = documents_count
    conn.executemany("INSERT INTO metadata VALUES (?, ?)", [(k, str(v)) for k, v in metadata.items()])
    
    conn.commit()
    conn.close()

    # Emit companion scipy.sparse files
    matrix_path = output.with_name(output.stem + "_matrix.npz")
    meta_path = output.with_name(output.stem + "_meta.npz")
    try:
        import numpy as np
        import scipy.sparse as sp

        matrix = sp.csr_matrix(
            (csr_data, (csr_rows, csr_cols)),
            shape=(len(csr_term_to_idx), documents_count),
            dtype=np.float32,
        )
        sp.save_npz(str(matrix_path), matrix)
        np.savez_compressed(
            str(meta_path),
            terms=np.array(list(csr_term_to_idx.keys())),
            doc_norms=np.array(doc_norms_list, dtype=np.float32),
        )
        print(f"Cache NPZ written: {matrix_path} (matrix shape: {len(csr_term_to_idx)} x {documents_count})")
    except ImportError:
        print("Warning: scipy/numpy not installed — skipping companion .npz files. Install with: pip install scipy numpy")

    elapsed = time.perf_counter() - started
    print(f"Cache written (SQLite): {output}")
    print(f"Variant: {variant} n_values={n_values}")
    print(f"Docs indexed: {documents_count}")
    print(f"Vocab size: {len(idf)}")
    if duplicate_name_count:
        print(f"Warning: duplicate source filenames observed: {duplicate_name_count}")
    print(f"Elapsed: {elapsed:.1f}s")


def main() -> None:
    args = parse_args()
    output = args.output or (ARTIFACTS_DIR / f"cache_{args.variant.lower()}.db")
    build_cache(
        variant=args.variant,
        source_dir=args.source_dir,
        output=output,
        max_sources=args.max_sources,
        source_language=args.source_language,
        manifest_db=args.manifest_db,
        jobs=args.jobs,
        max_words=args.max_words,
        min_df=args.min_df,
        max_df=args.max_df,
        max_vocab=args.max_vocab,
    )


if __name__ == "__main__":
    main()

