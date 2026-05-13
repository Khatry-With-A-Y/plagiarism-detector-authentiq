"""End-to-end fast-evaluation orchestration script.

Chains: create_split -> build_variant_cache -> run_benchmark -> evaluate_metrics -> generate_report_tables
with speed-optimized defaults, then prints a concise summary table.

Default variant is "B2T3" (bigrams + trigrams), which exactly mirrors the production preprocessing
path (TextProcessor.preprocess_for_tfidf). This ensures the benchmark measures the same TF-IDF
and cosine similarity algorithm that the production app uses.

Usage:
    python -m backend.benchmark.run_fast_eval --max-per-stratum 300 --max-words 500
    python -m backend.benchmark.run_fast_eval --variant B2T3 --max-per-stratum 300 --max-words 500
"""
import argparse
import json
import sys
import time
from argparse import Namespace
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.benchmark.config import (  # noqa: E402
    ARTIFACTS_DIR,
    DEFAULT_MAX_PER_STRATUM,
    DEFAULT_MAX_WORDS,
    DEFAULT_QUERY_MAX_WORDS,
    DEFAULT_MIN_DF,
    DEFAULT_MAX_DF,
    DEFAULT_MAX_VOCAB,
    DEFAULT_DEV_RATIO,
    DEFAULT_RANDOM_SEED,
    DEFAULT_SENTENCE_MATCH_THRESHOLD,
    DEFAULT_TOP_K,
    DEFAULT_TOP_N_FOR_SPANS,
    MANIFEST_DB_DEFAULT,
    SOURCE_DOC_DIR_DEFAULT,
    SPLIT_JSON_DEFAULT,
    SUSPICIOUS_DOC_DIR_DEFAULT,
    VARIANT_NGRAMS,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="End-to-end fast benchmark evaluation with speed-optimised defaults."
    )
    parser.add_argument(
        "--variant",
        choices=sorted(VARIANT_NGRAMS.keys()),
        default="B2T3",
        help="N-gram variant to use. B2T3 (default) exactly matches the production preprocessing "
             "(bigrams + trigrams via TextProcessor.preprocess_for_tfidf).",
    )
    parser.add_argument("--subset", choices=["dev", "test", "all"], default="dev")
    parser.add_argument("--max-per-stratum", type=int, default=DEFAULT_MAX_PER_STRATUM,
                        help=f"Per-stratum doc cap for create_split (default: {DEFAULT_MAX_PER_STRATUM}).")
    parser.add_argument("--max-words", type=int, default=DEFAULT_MAX_WORDS,
                        help=f"Word truncation per SOURCE document during cache build (default: {DEFAULT_MAX_WORDS}).")
    parser.add_argument("--query-max-words", type=int, default=DEFAULT_QUERY_MAX_WORDS,
                        help="Word truncation per SUSPICIOUS (query) document during retrieval. "
                             "Default: None (no truncation). Truncating queries cuts off deep plagiarised spans.")
    parser.add_argument("--min-df", type=int, default=DEFAULT_MIN_DF,
                        help=f"Vocab pruning: min document frequency (default: {DEFAULT_MIN_DF}).")
    parser.add_argument("--max-df", type=float, default=DEFAULT_MAX_DF,
                        help=f"Vocab pruning: max document frequency fraction (default: {DEFAULT_MAX_DF}).")
    parser.add_argument("--max-vocab", type=int, default=DEFAULT_MAX_VOCAB,
                        help=f"Vocab cap after pruning (default: {DEFAULT_MAX_VOCAB}).")
    parser.add_argument("--lsh", action="store_true",
                        help="Use MinHash LSH pre-filter to narrow candidates before TF-IDF scoring.")
    parser.add_argument("--skip-split", action="store_true",
                        help="Skip create_split step (reuse existing split JSON).")
    parser.add_argument("--skip-cache", action="store_true",
                        help="Skip build_variant_cache step (reuse existing cache DB).")
    parser.add_argument("--split-json", type=Path, default=SPLIT_JSON_DEFAULT)
    parser.add_argument("--manifest-db", type=Path, default=MANIFEST_DB_DEFAULT)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DOC_DIR_DEFAULT)
    parser.add_argument("--suspicious-dir", type=Path, default=SUSPICIOUS_DOC_DIR_DEFAULT)
    parser.add_argument("--output-dir", type=Path, default=ARTIFACTS_DIR / "runs")
    parser.add_argument("--jobs", type=int, default=None,
                        help="Parallel jobs for cache build and benchmark (default: auto).")
    parser.add_argument("--limit", type=int, default=None,
                        help="Cap suspicious docs processed in benchmark (for quick smoke tests).")
    return parser.parse_args()


def _step_create_split(args: argparse.Namespace) -> None:
    from backend.benchmark.create_split import create_split

    print("\n=== Step 1/5: create_split ===")
    create_split(
        manifest_db=args.manifest_db,
        output=args.split_json,
        dev_ratio=DEFAULT_DEV_RATIO,
        seed=DEFAULT_RANDOM_SEED,
        suspicious_language="en",
        source_language="en",
        source_language_mode="all",
        max_total=None,
        max_per_stratum=args.max_per_stratum,
    )


def _step_build_cache(args: argparse.Namespace, cache_path: Path) -> None:
    import multiprocessing
    from backend.benchmark.build_variant_cache import build_cache

    jobs = args.jobs or max(1, min(multiprocessing.cpu_count(), 4))
    print(f"\n=== Step 2/5: build_variant_cache (jobs={jobs}) ===")
    build_cache(
        variant=args.variant,
        source_dir=args.source_dir,
        output=cache_path,
        max_sources=None,
        source_language="en",
        manifest_db=args.manifest_db,
        jobs=jobs,
        max_words=args.max_words,
        min_df=args.min_df,
        max_df=args.max_df,
        max_vocab=args.max_vocab,
    )


def _step_run_benchmark(args: argparse.Namespace, cache_path: Path) -> tuple[Path, Path, Path]:
    import multiprocessing
    from backend.benchmark.run_benchmark import run_benchmark as _run

    jobs = args.jobs or max(1, min(multiprocessing.cpu_count(), 4))
    print(f"\n=== Step 3/5: run_benchmark (jobs={jobs}) ===")
    bench_args = Namespace(
        variant=args.variant,
        cache=cache_path,
        manifest_db=args.manifest_db,
        split_json=args.split_json,
        subset=args.subset,
        suspicious_dir=args.suspicious_dir,
        source_dir=args.source_dir,
        output_dir=args.output_dir,
        top_k=DEFAULT_TOP_K,
        top_n_spans=DEFAULT_TOP_N_FOR_SPANS,
        sentence_threshold=DEFAULT_SENTENCE_MATCH_THRESHOLD,
        limit=args.limit,
        max_words=args.query_max_words,
        lsh=args.lsh,
        lsh_cache=None,
        skip_localization=False,
        jobs=jobs,
    )
    _run(bench_args)

    # Discover the most-recently created run files
    run_dir = args.output_dir
    prefix = f"{args.variant.lower()}_{args.subset}_"
    runs = sorted(run_dir.glob(f"runtime_{prefix}*.csv"), reverse=True)
    if not runs:
        raise FileNotFoundError(f"No runtime CSV found in {run_dir} for prefix {prefix}")
    ts_suffix = runs[0].name.replace(f"runtime_{prefix}", "").replace(".csv", "")
    run_id = f"{prefix}{ts_suffix}"
    return (
        run_dir / f"retrieval_{run_id}.csv",
        run_dir / f"spans_{run_id}.csv",
        run_dir / f"runtime_{run_id}.csv",
    )


def _step_evaluate_metrics(
    args: argparse.Namespace,
    retrieval_csv: Path,
    spans_csv: Path,
    runtime_csv: Path,
) -> dict:
    from backend.benchmark.evaluate_metrics import evaluate

    print("\n=== Step 4/5: evaluate_metrics ===")
    eval_args = Namespace(
        manifest_db=args.manifest_db,
        retrieval_csv=retrieval_csv,
        spans_csv=spans_csv,
        runtime_csv=runtime_csv,
        split_json=args.split_json,
        subset=args.subset,
        variant=args.variant,
        output_json=None,
        fp_threshold=0.0001,
    )
    metrics = evaluate(eval_args)
    output_json = ARTIFACTS_DIR / f"metrics_{args.variant.lower()}_{args.subset}.json"
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Metrics written: {output_json}")
    return metrics


def _step_generate_report_tables() -> None:
    from backend.benchmark.generate_report_tables import _load_metrics, _write_overall_table, _write_type_table, _write_obf_table

    print("\n=== Step 5/5: generate_report_tables ===")
    output_dir = ARTIFACTS_DIR / "report_tables"
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics = _load_metrics(ARTIFACTS_DIR, "metrics_*.json")
    if metrics:
        overall = _write_overall_table(output_dir, metrics)
        by_type = _write_type_table(output_dir, metrics)
        by_obf = _write_obf_table(output_dir, metrics)
        print(f"Overall table: {overall}")
        print(f"Type breakdown table: {by_type}")
        print(f"Obfuscation breakdown table: {by_obf}")
    else:
        print("No metrics files found — report tables skipped.")


def _print_summary(args: argparse.Namespace, metrics: dict, wall_seconds: float) -> None:
    r = metrics.get("retrieval", {})
    loc = metrics.get("localization", {})
    rt = metrics.get("runtime", {})
    counts = metrics.get("counts", {})
    print("\n" + "=" * 60)
    print("FAST EVAL SUMMARY")
    print("=" * 60)
    print(f"  Variant          : {args.variant}")
    print(f"  Subset           : {args.subset}")
    print(f"  Plag docs        : {counts.get('plag_docs', 'n/a')}")
    print(f"  Max words        : {args.max_words}")
    print(f"  Max per stratum  : {args.max_per_stratum}")
    print(f"  LSH pre-filter   : {'on' if args.lsh else 'off'}")
    print(f"  Hit@1            : {r.get('hit_at_1', 0.0):.4f}")
    print(f"  Hit@5            : {r.get('hit_at_5', 0.0):.4f}")
    print(f"  MRR              : {r.get('mrr', 0.0):.4f}")
    print(f"  Span F1          : {loc.get('f1', 0.0):.4f}")
    print(f"  Avg s/doc        : {rt.get('avg_seconds', 0.0):.3f}s")
    print(f"  Throughput       : {rt.get('throughput_docs_per_min', 0.0):.1f} docs/min")
    print(f"  Total wall time  : {wall_seconds:.1f}s ({wall_seconds / 60:.1f} min)")
    print("=" * 60)


def main() -> None:
    args = parse_args()
    wall_start = time.perf_counter()
    cache_path = ARTIFACTS_DIR / f"cache_{args.variant.lower()}.db"

    if not args.skip_split:
        _step_create_split(args)
    else:
        print("\n=== Step 1/5: create_split [SKIPPED] ===")

    if not args.skip_cache:
        _step_build_cache(args, cache_path)
    else:
        print("\n=== Step 2/5: build_variant_cache [SKIPPED] ===")

    retrieval_csv, spans_csv, runtime_csv = _step_run_benchmark(args, cache_path)
    metrics = _step_evaluate_metrics(args, retrieval_csv, spans_csv, runtime_csv)
    _step_generate_report_tables()

    wall_seconds = time.perf_counter() - wall_start
    _print_summary(args, metrics, wall_seconds)


if __name__ == "__main__":
    main()
