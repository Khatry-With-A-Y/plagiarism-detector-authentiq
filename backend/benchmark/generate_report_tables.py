import argparse
import csv
import json
import sys
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.benchmark.config import ARTIFACTS_DIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Aggregate metrics JSON files into report tables.")
    parser.add_argument(
        "--metrics-glob",
        default="metrics_*.json",
        help="Glob under --metrics-dir for metric json files.",
    )
    parser.add_argument("--metrics-dir", type=Path, default=ARTIFACTS_DIR)
    parser.add_argument("--output-dir", type=Path, default=ARTIFACTS_DIR / "report_tables")
    return parser.parse_args()


def _load_metrics(metrics_dir: Path, pattern: str) -> list[dict]:
    rows = []
    for path in sorted(metrics_dir.glob(pattern)):
        rows.append(json.loads(path.read_text(encoding="utf-8")))
    return rows


def _write_overall_table(output_dir: Path, metrics: list[dict]) -> Path:
    path = output_dir / "overall_metrics_table.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "variant",
                "subset",
                "plag_docs",
                "hit_at_1",
                "hit_at_5",
                "hit_at_10",
                "mrr",
                "span_precision",
                "span_recall",
                "span_f1",
                "clean_doc_fp_rate",
                "avg_seconds",
                "p95_seconds",
                "throughput_docs_per_min",
            ]
        )
        for m in metrics:
            writer.writerow(
                [
                    m["variant"],
                    m["subset"],
                    m["counts"]["plag_docs"],
                    round(m["retrieval"]["hit_at_1"], 6),
                    round(m["retrieval"]["hit_at_5"], 6),
                    round(m["retrieval"]["hit_at_10"], 6),
                    round(m["retrieval"]["mrr"], 6),
                    round(m["localization"]["precision"], 6),
                    round(m["localization"]["recall"], 6),
                    round(m["localization"]["f1"], 6),
                    round(m["clean_doc_false_positive_rate"], 6),
                    round(m["runtime"]["avg_seconds"], 6),
                    round(m["runtime"]["p95_seconds"], 6),
                    round(m["runtime"]["throughput_docs_per_min"], 6),
                ]
            )
    return path


def _write_type_table(output_dir: Path, metrics: list[dict]) -> Path:
    path = output_dir / "type_breakdown_table.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "variant",
                "subset",
                "type",
                "doc_count",
                "hit_at_5",
                "mrr",
                "span_f1",
            ]
        )
        for m in metrics:
            for type_name, values in sorted(m.get("by_type", {}).items()):
                writer.writerow(
                    [
                        m["variant"],
                        m["subset"],
                        type_name,
                        values["retrieval"]["count"],
                        round(values["retrieval"]["hit_at_5"], 6),
                        round(values["retrieval"]["mrr"], 6),
                        round(values["localization"]["f1"], 6),
                    ]
                )
    return path


def _write_obf_table(output_dir: Path, metrics: list[dict]) -> Path:
    path = output_dir / "obfuscation_breakdown_table.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "variant",
                "subset",
                "obfuscation",
                "doc_count",
                "hit_at_5",
                "mrr",
                "span_f1",
            ]
        )
        for m in metrics:
            for obf_name, values in sorted(m.get("by_obfuscation", {}).items()):
                writer.writerow(
                    [
                        m["variant"],
                        m["subset"],
                        obf_name,
                        values["retrieval"]["count"],
                        round(values["retrieval"]["hit_at_5"], 6),
                        round(values["retrieval"]["mrr"], 6),
                        round(values["localization"]["f1"], 6),
                    ]
                )
    return path


def main() -> None:
    args = parse_args()
    metrics = _load_metrics(args.metrics_dir, args.metrics_glob)
    if not metrics:
        raise FileNotFoundError(f"No metrics files matched {args.metrics_glob} in {args.metrics_dir}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    overall = _write_overall_table(args.output_dir, metrics)
    by_type = _write_type_table(args.output_dir, metrics)
    by_obf = _write_obf_table(args.output_dir, metrics)

    print(f"Overall table: {overall}")
    print(f"Type breakdown table: {by_type}")
    print(f"Obfuscation breakdown table: {by_obf}")


if __name__ == "__main__":
    main()

