import argparse
import csv
import gzip
import json
import math
import multiprocessing
import pickle
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache, partial
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.app.utils.text_processing import TextProcessor  # noqa: E402
from backend.app.utils.tfidf import TFIDFCalculator  # noqa: E402
from backend.benchmark.config import (  # noqa: E402
    ARTIFACTS_DIR,
    DEFAULT_MAX_WORDS,
    DEFAULT_SENTENCE_MATCH_THRESHOLD,
    DEFAULT_TOP_K,
    DEFAULT_TOP_N_FOR_SPANS,
    MANIFEST_DB_DEFAULT,
    SOURCE_DOC_DIR_DEFAULT,
    SPLIT_JSON_DEFAULT,
    SUSPICIOUS_DOC_DIR_DEFAULT,
    VARIANT_NGRAMS,
)
from backend.benchmark.ngrams import preprocess_for_variant  # noqa: E402
from backend.benchmark.utils import merge_intervals, read_text  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run PAN benchmark for one n-gram variant.")
    parser.add_argument("--variant", choices=sorted(VARIANT_NGRAMS.keys()), required=True)
    parser.add_argument("--cache", type=Path, default=None)
    parser.add_argument("--manifest-db", type=Path, default=MANIFEST_DB_DEFAULT)
    parser.add_argument("--split-json", type=Path, default=SPLIT_JSON_DEFAULT)
    parser.add_argument("--subset", choices=["dev", "test", "all"], default="test")
    parser.add_argument("--suspicious-dir", type=Path, default=SUSPICIOUS_DOC_DIR_DEFAULT)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DOC_DIR_DEFAULT)
    parser.add_argument("--output-dir", type=Path, default=ARTIFACTS_DIR / "runs")
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--top-n-spans", type=int, default=DEFAULT_TOP_N_FOR_SPANS)
    parser.add_argument("--sentence-threshold", type=float, default=DEFAULT_SENTENCE_MATCH_THRESHOLD)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-words", type=int, default=None, help="Truncate each suspicious document to this many words before tokenization (default: no cap).")
    parser.add_argument("--lsh", action="store_true", help="Use MinHash LSH pre-filter to narrow candidates before TF-IDF scoring.")
    parser.add_argument("--lsh-cache", type=Path, default=None, help="Path to LSH index file (default: artifacts/lsh_<variant>.pkl.gz).")
    parser.add_argument("--skip-localization", action="store_true")
    _safe_default_jobs = max(1, min(multiprocessing.cpu_count(), 4))
    parser.add_argument("--jobs", type=int, default=_safe_default_jobs, help="Number of parallel jobs (default: min(cpu_count, 4) to avoid OOM).")
    return parser.parse_args()


def _load_cache(path: Path) -> dict:
    if path.suffix == ".gz":
        with gzip.open(path, "rb") as handle:
            return pickle.load(handle)
    
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.execute("PRAGMA mmap_size=268435456")   # 256 MB memory-mapped I/O
    conn.execute("PRAGMA cache_size=-131072")    # 128 MB page cache per connection
    conn.execute("PRAGMA temp_store=MEMORY")
    cursor = conn.cursor()
    meta = {}
    for key, value in cursor.execute("SELECT key, value FROM metadata").fetchall():
        try:
            meta[key] = json.loads(value.replace("'", '"'))
        except Exception:
            meta[key] = value

    documents = {}
    for row in cursor.execute("SELECT id, source_file, rel_path, abs_path, norm FROM documents").fetchall():
        documents[row[0]] = {
            "source_file": row[1],
            "rel_path": row[2],
            "abs_path": row[3],
            "norm": row[4],
        }
    
    return {
        "conn": conn,
        "metadata": meta,
        "documents": documents,
        "variant": meta.get("variant"),
        "n_values": tuple(meta.get("n_values", [1])),
    }


def build_lsh_index(conn: sqlite3.Connection, num_perm: int = 128) -> tuple:
    """Build a MinHashLSH index from postings stored in a SQLite cache.

    Returns (lsh, minhash_map) where minhash_map maps doc_idx -> MinHash.
    Raises ImportError if datasketch is not installed.
    """
    try:
        from datasketch import MinHash, MinHashLSH
    except ImportError as exc:
        raise ImportError(
            "datasketch is required for --lsh. Install it with: pip install datasketch>=1.6.0"
        ) from exc

    lsh = MinHashLSH(threshold=0.5, num_perm=num_perm)
    minhash_map: dict[int, object] = {}

    # Load all postings: group terms by doc_idx
    doc_terms: dict[int, set[str]] = defaultdict(set)
    for term, doc_idx in conn.execute("SELECT term, doc_idx FROM postings").fetchall():
        doc_terms[doc_idx].add(term)

    for doc_idx, terms in doc_terms.items():
        m = MinHash(num_perm=num_perm)
        for t in terms:
            m.update(t.encode("utf-8"))
        lsh.insert(str(doc_idx), m)
        minhash_map[doc_idx] = m

    return lsh, minhash_map


def _load_lsh_index(path: Path) -> tuple:
    """Load a gzip-pickled (lsh, minhash_map) tuple from disk."""
    with gzip.open(path, "rb") as handle:
        return pickle.load(handle)


def _save_lsh_index(lsh_tuple: tuple, path: Path) -> None:
    """Save (lsh, minhash_map) tuple as gzip-pickle."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wb") as handle:
        pickle.dump(lsh_tuple, handle, protocol=pickle.HIGHEST_PROTOCOL)


def _get_idf(conn: sqlite3.Connection, terms: set[str], default_idf: float) -> dict[str, float]:
    if not terms:
        return {}
    term_list = list(terms)
    results = {}
    for i in range(0, len(term_list), 900):
        chunk = term_list[i : i + 900]
        placeholders = ",".join(["?"] * len(chunk))
        rows = conn.execute(f"SELECT term, value FROM idf WHERE term IN ({placeholders})", chunk).fetchall()
        for term, val in rows:
            results[term] = val
    return results


def _load_split(split_json: Path, subset: str) -> set[str] | None:
    if subset == "all":
        return None
    payload = json.loads(split_json.read_text(encoding="utf-8"))
    key = "dev_suspicious_files" if subset == "dev" else "test_suspicious_files"
    return set(payload.get(key, []))


def _load_suspicious_map(manifest_db: Path, include_files: set[str] | None, limit: int | None) -> list[tuple[str, str]]:
    conn = sqlite3.connect(manifest_db)
    cursor = conn.cursor()
    rows = cursor.execute(
        "SELECT suspicious_file, rel_path FROM suspicious_documents ORDER BY suspicious_file"
    ).fetchall()
    conn.close()

    filtered: list[tuple[str, str]] = []
    for suspicious_file, rel_path in rows:
        if include_files is not None and suspicious_file not in include_files:
            continue
        filtered.append((suspicious_file, rel_path))
    if limit is not None:
        filtered = filtered[:limit]
    return filtered


def _rank_sources(
    conn_or_postings: sqlite3.Connection | dict,
    query_terms: list[str],
    idf_or_documents: dict | list,
    documents_legacy: list[dict] | None,
    n_values: tuple[int, ...],
    top_k: int,
) -> tuple[list[tuple[int, float]], int]:
    if not query_terms:
        return [], 0

    tf = TFIDFCalculator.compute_tf(query_terms)
    
    if isinstance(conn_or_postings, sqlite3.Connection):
        # SQLite path
        conn = conn_or_postings
        documents = idf_or_documents
        num_docs = len(documents)
        default_idf = math.log(max(num_docs, 1))
        idf_map = _get_idf(conn, set(tf.keys()), default_idf)
        
        query_weights = {}
        norm_query_sq = 0.0
        for term, tf_value in tf.items():
            weight = tf_value * idf_map.get(term, default_idf)
            if weight <= 0:
                continue
            query_weights[term] = weight
            norm_query_sq += weight * weight

        norm_query = math.sqrt(norm_query_sq)
        if norm_query == 0:
            return [], 0

        dot_scores: dict[int, float] = defaultdict(float)
        term_list = list(query_weights.keys())
        for i in range(0, len(term_list), 900):
            chunk = term_list[i : i + 900]
            placeholders = ",".join(["?"] * len(chunk))
            rows = conn.execute(
                f"SELECT term, doc_idx, weight FROM postings WHERE term IN ({placeholders})",
                chunk
            ).fetchall()
            for term, doc_idx, doc_weight in rows:
                dot_scores[doc_idx] += query_weights[term] * doc_weight
        
        if not dot_scores:
            return [], 0

        scored = []
        for doc_idx, dot in dot_scores.items():
            doc_info = documents.get(doc_idx)
            if not doc_info or doc_info["norm"] <= 0:
                continue
            similarity = dot / (norm_query * doc_info["norm"])
            if similarity > 0:
                scored.append((doc_idx, similarity))
    else:
        # Legacy Pickle path
        postings = conn_or_postings
        idf = idf_or_documents
        documents = documents_legacy
        default_idf = math.log(max(len(documents), 1))
        query_weights = {}
        norm_query_sq = 0.0
        for term, tf_value in tf.items():
            weight = tf_value * idf.get(term, default_idf)
            if weight <= 0:
                continue
            query_weights[term] = weight
            norm_query_sq += weight * weight

        norm_query = math.sqrt(norm_query_sq)
        if norm_query == 0:
            return [], 0

        dot_scores: dict[int, float] = defaultdict(float)
        for term, query_weight in query_weights.items():
            for doc_idx, doc_weight in postings.get(term, ()):
                dot_scores[doc_idx] += query_weight * doc_weight

        if not dot_scores:
            return [], 0

        scored = []
        for doc_idx, dot in dot_scores.items():
            doc_norm = documents[doc_idx]["norm"]
            if doc_norm <= 0:
                continue
            similarity = dot / (norm_query * doc_norm)
            if similarity > 0:
                scored.append((doc_idx, similarity))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:top_k], len(dot_scores)


def _build_sentence_vectors(
    text: str,
    conn_or_idf: sqlite3.Connection | dict,
    n_values: tuple[int, ...],
    default_idf: float,
) -> list[tuple[dict, dict[str, float], set[str], float]]:
    vectors = []
    sentences = TextProcessor.split_into_sentences(text)
    
    # Pre-fetch all IDF for all sentences if SQLite
    all_terms = set()
    sentence_terms = []
    for s in sentences:
        terms = preprocess_for_variant(s["text"], n_values)
        sentence_terms.append(terms)
        if terms:
            all_terms.update(terms)
            
    if isinstance(conn_or_idf, sqlite3.Connection):
        idf_map = _get_idf(conn_or_idf, all_terms, default_idf)
    else:
        idf_map = conn_or_idf  # already a pre-loaded dict — no DB query

    for i, sentence in enumerate(sentences):
        terms = sentence_terms[i]
        if not terms:
            continue
        tf = TFIDFCalculator.compute_tf(terms)
        term_set = set(terms)
        norm_sq = sum((tf.get(term, 0.0) * idf_map.get(term, default_idf)) ** 2 for term in term_set)
        norm = math.sqrt(norm_sq) if norm_sq > 0 else 0.0
        if norm > 0:
            vectors.append((sentence, tf, term_set, norm))
    return vectors


def _compute_submission_highlights(
    submission_text: str,
    source_text: str,
    conn_or_idf: sqlite3.Connection | dict,
    n_values: tuple[int, ...],
    threshold: float,
    top_n: int,
    default_idf: float,
) -> list[tuple[int, int, float]]:
    sub_vectors = _build_sentence_vectors(submission_text, conn_or_idf, n_values, default_idf)
    source_vectors = _build_sentence_vectors(source_text, conn_or_idf, n_values, default_idf)
    if not sub_vectors or not source_vectors:
        return []

    matches: list[tuple[int, int, float]] = []
    for sentence, sub_tf, sub_terms, sub_norm in sub_vectors:
        best_similarity = 0.0
        for _, src_tf, src_terms, src_norm in source_vectors:
            shared = sub_terms & src_terms
            if not shared:
                continue
            
            # conn_or_idf is always a pre-loaded dict — direct lookup, zero DB queries
            local_idf = conn_or_idf

            dot = sum(
                (sub_tf.get(term, 0.0) * local_idf.get(term, default_idf))
                * (src_tf.get(term, 0.0) * local_idf.get(term, default_idf))
                for term in shared
            )
            similarity = dot / (sub_norm * src_norm)
            if similarity >= threshold and similarity > best_similarity:
                best_similarity = similarity

        if best_similarity >= threshold:
            matches.append((sentence["start"], sentence["end"], round(best_similarity, 4)))

    matches.sort(key=lambda item: item[2], reverse=True)
    top_matches = matches[:top_n]
    top_matches.sort(key=lambda item: item[0])
    return top_matches


@lru_cache(maxsize=256)
def _cached_read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8", errors="ignore")


_worker_cache: dict | None = None


def _init_worker(cache_path: Path, lsh_path: Path | None = None) -> None:
    global _worker_cache
    cache = _load_cache(cache_path)
    conn = cache.get("conn")
    if conn is not None:
        # Load entire IDF table into RAM for fast localization lookups.
        idf_rows = conn.execute("SELECT term, value FROM idf").fetchall()
        cache["idf_dict"] = dict(idf_rows)
        cache["idf"] = cache["idf_dict"]

        # Load entire postings table into a RAM dict so retrieval uses the fast
        # in-memory path (dict.get) instead of per-query SQLite chunk scans.
        # For B2T3/U1B2/U1B2T3 with min_df=10 this is ~2-20M rows (~100-500 MB RAM)
        # but reduces per-doc retrieval from seconds to milliseconds.
        print("[worker-init] Loading postings into RAM...", flush=True)
        postings: dict[str, list[tuple[int, float]]] = defaultdict(list)
        for term, doc_idx, weight in conn.execute(
            "SELECT term, doc_idx, weight FROM postings"
        ).fetchall():
            postings[term].append((doc_idx, weight))
        cache["postings"] = dict(postings)
        print(f"[worker-init] Loaded {len(postings):,} terms into RAM.", flush=True)

        # Close the connection — all data is now in RAM; workers no longer need SQLite.
        conn.close()
        cache["conn"] = None

    if lsh_path is not None and lsh_path.exists():
        cache["lsh"], cache["lsh_minhash"] = _load_lsh_index(lsh_path)
    _worker_cache = cache


def _rank_sources_lsh(
    conn: sqlite3.Connection,
    query_terms: list[str],
    documents: dict,
    n_values: tuple,
    top_k: int,
    lsh: object,
    num_perm: int = 128,
) -> tuple[list[tuple[int, float]], int]:
    """TF-IDF ranking narrowed by MinHash LSH candidate pre-filter."""
    if not query_terms:
        return [], 0
    try:
        from datasketch import MinHash
    except ImportError as exc:
        raise ImportError(
            "datasketch is required for --lsh. Install it with: pip install datasketch>=1.6.0"
        ) from exc

    q_minhash = MinHash(num_perm=num_perm)
    for t in set(query_terms):
        q_minhash.update(t.encode("utf-8"))

    candidate_keys = lsh.query(q_minhash)
    if not candidate_keys:
        return [], 0

    candidate_doc_indices = {int(k) for k in candidate_keys}

    tf = TFIDFCalculator.compute_tf(query_terms)
    num_docs = len(documents)
    default_idf = math.log(max(num_docs, 1))
    idf_map = _get_idf(conn, set(tf.keys()), default_idf)

    query_weights = {}
    norm_query_sq = 0.0
    for term, tf_value in tf.items():
        weight = tf_value * idf_map.get(term, default_idf)
        if weight <= 0:
            continue
        query_weights[term] = weight
        norm_query_sq += weight * weight

    norm_query = math.sqrt(norm_query_sq)
    if norm_query == 0:
        return [], 0

    # Fetch postings only for candidate docs
    dot_scores: dict[int, float] = defaultdict(float)
    term_list = list(query_weights.keys())
    for i in range(0, len(term_list), 900):
        chunk = term_list[i : i + 900]
        placeholders = ",".join(["?"] * len(chunk))
        rows = conn.execute(
            f"SELECT term, doc_idx, weight FROM postings WHERE term IN ({placeholders})",
            chunk
        ).fetchall()
        for term, doc_idx, doc_weight in rows:
            if doc_idx in candidate_doc_indices:
                dot_scores[doc_idx] += query_weights[term] * doc_weight

    if not dot_scores:
        return [], 0

    scored = []
    for doc_idx, dot in dot_scores.items():
        doc_info = documents.get(doc_idx)
        if not doc_info or doc_info["norm"] <= 0:
            continue
        similarity = dot / (norm_query * doc_info["norm"])
        if similarity > 0:
            scored.append((doc_idx, similarity))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:top_k], len(candidate_doc_indices)


def _worker_benchmark_task(item: tuple) -> tuple:
    (
        suspicious_file,
        rel_path,
        suspicious_dir,
        top_k,
        top_n_spans,
        sentence_threshold,
        skip_localization,
        max_words,
    ) = item

    global _worker_cache
    if _worker_cache is None:
        return [], [], [], [(suspicious_file, "Worker cache not initialized")]

    n_values = _worker_cache["n_values"]
    documents = _worker_cache["documents"]
    conn = _worker_cache.get("conn")
    lsh = _worker_cache.get("lsh")
    default_idf = math.log(max(len(documents), 1))

    ret_rows = []
    sp_rows = []
    run_rows = []
    err_rows = []

    loop_start = time.perf_counter()
    try:
        suspicious_path = suspicious_dir / rel_path
        suspicious_text = read_text(suspicious_path)
        query_terms = preprocess_for_variant(suspicious_text, n_values, max_words=max_words)

        if conn and lsh is not None:
            ranked, candidate_count = _rank_sources_lsh(conn, query_terms, documents, n_values, top_k, lsh)
        elif conn:
            ranked, candidate_count = _rank_sources(conn, query_terms, documents, None, n_values, top_k)
        else:
            idf = _worker_cache["idf"]
            postings = _worker_cache["postings"]
            ranked, candidate_count = _rank_sources(postings, query_terms, idf, documents, n_values, top_k)

        top_score = 0.0
        for rank, (doc_idx, score) in enumerate(ranked, start=1):
            source_file = documents[doc_idx]["source_file"]
            ret_rows.append((suspicious_file, rank, source_file, round(score, 6)))
            if rank == 1:
                top_score = score

        if not skip_localization and ranked:
            top_docs = ranked[: max(1, top_n_spans)]
            collected_intervals: list[tuple[int, int, float, str]] = []
            # Use pre-loaded idf_dict for fast in-memory lookups (no per-pair DB queries)
            idf_for_localization = _worker_cache.get("idf_dict") or _worker_cache.get("idf", {})
            for doc_idx, _ in top_docs:
                source_meta = documents[doc_idx]
                source_text = _cached_read(source_meta["abs_path"])
                
                highlights = _compute_submission_highlights(
                    submission_text=suspicious_text,
                    source_text=source_text,
                    conn_or_idf=idf_for_localization,
                    n_values=n_values,
                    threshold=sentence_threshold,
                    top_n=20,
                    default_idf=default_idf,
                )
                for start, end, similarity in highlights:
                    collected_intervals.append((start, end, similarity, source_meta["source_file"]))

            interval_best: dict[tuple[int, int], tuple[float, str]] = {}
            for start, end, similarity, source_file in collected_intervals:
                key = (start, end)
                current = interval_best.get(key)
                if current is None or similarity > current[0]:
                    interval_best[key] = (similarity, source_file)

            merged_keys = merge_intervals(list(interval_best.keys()))
            for start, end in merged_keys:
                score_source = interval_best.get((start, end), (0.0, ""))
                sp_rows.append((suspicious_file, start, end, score_source[1], score_source[0]))

        elapsed = time.perf_counter() - loop_start
        run_rows.append((suspicious_file, round(elapsed, 6), candidate_count, round(top_score, 6)))
    except Exception as exc:
        err_rows.append((suspicious_file, str(exc)))

    return ret_rows, sp_rows, run_rows, err_rows


def run_benchmark(args: argparse.Namespace) -> None:
    cache_path = args.cache or (ARTIFACTS_DIR / f"cache_{args.variant.lower()}.db")
    if not cache_path.exists():
        # Fallback to legacy
        legacy_path = cache_path.with_suffix(".pkl.gz")
        if legacy_path.exists():
            cache_path = legacy_path
        else:
            raise FileNotFoundError(f"Variant cache not found: {cache_path}")

    if not args.manifest_db.exists():
        raise FileNotFoundError(f"Manifest DB not found: {args.manifest_db}")
    if args.subset != "all" and not args.split_json.exists():
        raise FileNotFoundError(f"Split JSON not found: {args.split_json}")

    started_at = datetime.now(timezone.utc)
    cache = _load_cache(cache_path)
    n_values = cache["n_values"]
    documents = cache["documents"]

    selected_files = _load_split(args.split_json, args.subset)
    suspicious_docs = _load_suspicious_map(args.manifest_db, selected_files, args.limit)
    if not suspicious_docs:
        raise ValueError("No suspicious files selected for this run.")

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    run_id = f"{args.variant.lower()}_{args.subset}_{started_at.strftime('%Y%m%dT%H%M%SZ')}"
    retrieval_path = output_dir / f"retrieval_{run_id}.csv"
    spans_path = output_dir / f"spans_{run_id}.csv"
    runtime_path = output_dir / f"runtime_{run_id}.csv"
    errors_path = output_dir / f"errors_{run_id}.csv"
    metadata_path = output_dir / f"run_metadata_{run_id}.json"

    retrieval_rows: list[tuple[str, int, str, float]] = []
    span_rows: list[tuple[str, int, int, str, float]] = []
    runtime_rows: list[tuple[str, float, int, float]] = []
    error_rows: list[tuple[str, str]] = []

    # Safety check: warn and clamp --jobs if RAM is low
    try:
        import psutil
        available_gb = psutil.virtual_memory().available / 1e9
        if args.jobs > 8 and available_gb < 12.0:
            safe_jobs = min(args.jobs, 6)
            print(
                f"WARNING: --jobs={args.jobs} but only {available_gb:.1f} GB RAM available. "
                f"Clamping to {safe_jobs} workers to avoid OOM."
            )
            args.jobs = safe_jobs
    except ImportError:
        pass  # psutil not installed; skip RAM check

    lsh_cache_path: Path | None = None
    if args.lsh:
        lsh_cache_path = args.lsh_cache or (ARTIFACTS_DIR / f"lsh_{args.variant.lower()}.pkl.gz")
        if not lsh_cache_path.exists():
            print(f"[lsh] LSH index not found at {lsh_cache_path}. Building now...")
            temp_cache = _load_cache(cache_path)
            conn_for_lsh = temp_cache.get("conn")
            if conn_for_lsh is None:
                raise ValueError("LSH pre-filter requires a SQLite cache (.db), not a legacy .pkl.gz cache.")
            lsh_tuple = build_lsh_index(conn_for_lsh)
            _save_lsh_index(lsh_tuple, lsh_cache_path)
            conn_for_lsh.close()
            print(f"[lsh] LSH index saved to {lsh_cache_path}")
        else:
            print(f"[lsh] Loading existing LSH index from {lsh_cache_path}")

    print(f"Starting benchmark with {args.jobs} parallel jobs...")
    worker_items = [
        (
            susp_file,
            rel_p,
            args.suspicious_dir,
            args.top_k,
            args.top_n_spans,
            args.sentence_threshold,
            args.skip_localization,
            args.max_words,
        )
        for susp_file, rel_p in suspicious_docs
    ]

    chunk_size = 1
    if len(worker_items) > args.jobs * 2:
        chunk_size = max(1, len(worker_items) // (args.jobs * 4))

    with multiprocessing.Pool(
        processes=args.jobs, initializer=_init_worker, initargs=(cache_path, lsh_cache_path)
    ) as pool:
        for idx, (ret_r, sp_r, run_r, err_r) in enumerate(
            pool.imap_unordered(_worker_benchmark_task, worker_items, chunksize=chunk_size),
            start=1,
        ):
            retrieval_rows.extend(ret_r)
            span_rows.extend(sp_r)
            runtime_rows.extend(run_r)
            error_rows.extend(err_r)
            if idx % 100 == 0 or idx == len(suspicious_docs):
                print(f"[run] processed {idx}/{len(suspicious_docs)} suspicious docs")

    with retrieval_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["suspicious_file", "rank", "source_file", "score"])
        writer.writerows(retrieval_rows)

    with spans_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["suspicious_file", "start", "end", "source_file", "similarity"])
        writer.writerows(span_rows)

    with runtime_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["suspicious_file", "seconds", "candidate_docs", "top_score"])
        writer.writerows(runtime_rows)

    with errors_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["suspicious_file", "error"])
        writer.writerows(error_rows)

    metadata = {
        "run_id": run_id,
        "variant": args.variant,
        "subset": args.subset,
        "n_values": n_values,
        "cache_path": str(cache_path),
        "manifest_db": str(args.manifest_db),
        "split_json": str(args.split_json),
        "suspicious_count": len(suspicious_docs),
        "retrieval_rows": len(retrieval_rows),
        "span_rows": len(span_rows),
        "error_count": len(error_rows),
        "started_at_utc": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "completed_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Run complete: {run_id}")
    print(f"Retrieval: {retrieval_path}")
    print(f"Spans: {spans_path}")
    print(f"Runtime: {runtime_path}")
    if error_rows:
        print(f"Errors: {errors_path} ({len(error_rows)} rows)")
    print(f"Metadata: {metadata_path}")


def main() -> None:
    run_benchmark(parse_args())


if __name__ == "__main__":
    main()

