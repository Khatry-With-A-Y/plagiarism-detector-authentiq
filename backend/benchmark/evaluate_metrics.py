import argparse
import csv
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.benchmark.config import ARTIFACTS_DIR, MANIFEST_DB_DEFAULT, SPLIT_JSON_DEFAULT  # noqa: E402
from backend.benchmark.utils import merge_intervals, overlap_length, percentile, total_interval_length  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate PAN benchmark outputs.")
    parser.add_argument("--manifest-db", type=Path, default=MANIFEST_DB_DEFAULT)
    parser.add_argument("--retrieval-csv", type=Path, required=True)
    parser.add_argument("--spans-csv", type=Path, required=True)
    parser.add_argument("--runtime-csv", type=Path, required=True)
    parser.add_argument("--split-json", type=Path, default=SPLIT_JSON_DEFAULT)
    parser.add_argument("--subset", choices=["dev", "test", "all"], default="test")
    parser.add_argument("--variant", required=True)
    parser.add_argument("--output-json", type=Path, default=None)
    parser.add_argument("--fp-threshold", type=float, default=0.0001)
    return parser.parse_args()


def _load_subset(split_json: Path, subset: str) -> set[str] | None:
    if subset == "all":
        return None
    payload = json.loads(split_json.read_text(encoding="utf-8"))
    key = "dev_suspicious_files" if subset == "dev" else "test_suspicious_files"
    return set(payload.get(key, []))


def _load_truth(manifest_db: Path, subset_files: set[str] | None):
    conn = sqlite3.connect(manifest_db)
    cursor = conn.cursor()

    doc_rows = cursor.execute(
        "SELECT suspicious_file, has_plagiarism FROM suspicious_documents"
    ).fetchall()
    has_plagiarism = {row[0]: bool(row[1]) for row in doc_rows}

    source_rows = cursor.execute(
        "SELECT suspicious_file, source_file FROM plagiarism_cases"
    ).fetchall()
    relevant_sources: dict[str, set[str]] = defaultdict(set)
    for suspicious_file, source_file in source_rows:
        relevant_sources[suspicious_file].add(source_file)

    span_rows = cursor.execute(
        "SELECT suspicious_file, this_offset, this_length FROM plagiarism_cases"
    ).fetchall()
    truth_spans: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for suspicious_file, offset, length in span_rows:
        if offset is None or length is None:
            continue
        truth_spans[suspicious_file].append((int(offset), int(offset) + int(length)))
    for key in list(truth_spans.keys()):
        truth_spans[key] = merge_intervals(truth_spans[key])

    type_rows = cursor.execute(
        "SELECT suspicious_file, plagiarism_type, obfuscation FROM plagiarism_cases"
    ).fetchall()
    type_map: dict[str, set[str]] = defaultdict(set)
    obf_map: dict[str, set[str]] = defaultdict(set)
    for suspicious_file, plagiarism_type, obfuscation in type_rows:
        if plagiarism_type:
            type_map[suspicious_file].add(plagiarism_type)
        if obfuscation:
            obf_map[suspicious_file].add(obfuscation)
        else:
            obf_map[suspicious_file].add("unknown")

    conn.close()

    all_docs = set(has_plagiarism.keys())
    if subset_files is not None:
        all_docs = all_docs & subset_files
    plag_docs = sorted([doc for doc in all_docs if has_plagiarism.get(doc)])
    clean_docs = sorted([doc for doc in all_docs if not has_plagiarism.get(doc)])

    return {
        "all_docs": sorted(all_docs),
        "plag_docs": plag_docs,
        "clean_docs": clean_docs,
        "relevant_sources": relevant_sources,
        "truth_spans": truth_spans,
        "type_map": type_map,
        "obf_map": obf_map,
    }


def _load_retrieval(path: Path) -> dict[str, list[tuple[int, str, float]]]:
    result: dict[str, list[tuple[int, str, float]]] = defaultdict(list)
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            result[row["suspicious_file"]].append(
                (int(row["rank"]), row["source_file"], float(row["score"]))
            )
    for key in result:
        result[key].sort(key=lambda item: item[0])
    return result


def _load_spans(path: Path) -> dict[str, list[tuple[int, int]]]:
    result: dict[str, list[tuple[int, int]]] = defaultdict(list)
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            result[row["suspicious_file"]].append((int(row["start"]), int(row["end"])))
    for key in result:
        result[key] = merge_intervals(result[key])
    return result


def _load_runtime(path: Path) -> list[float]:
    values = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            values.append(float(row["seconds"]))
    return values


def _retrieval_metrics(
    docs: list[str],
    retrieval: dict[str, list[tuple[int, str, float]]],
    relevant_sources: dict[str, set[str]],
) -> dict[str, float]:
    if not docs:
        return {
            "count": 0,
            "hit_at_1": 0.0,
            "hit_at_5": 0.0,
            "hit_at_10": 0.0,
            "mrr": 0.0,
        }

    hit1 = 0
    hit5 = 0
    hit10 = 0
    reciprocal_sum = 0.0

    for suspicious_file in docs:
        ranked = retrieval.get(suspicious_file, [])
        targets = relevant_sources.get(suspicious_file, set())
        first_rank = None
        for rank, source_file, _ in ranked:
            if source_file in targets:
                first_rank = rank
                break
        if first_rank is not None:
            if first_rank <= 1:
                hit1 += 1
            if first_rank <= 5:
                hit5 += 1
            if first_rank <= 10:
                hit10 += 1
            reciprocal_sum += 1.0 / float(first_rank)

    total = float(len(docs))
    return {
        "count": len(docs),
        "hit_at_1": hit1 / total,
        "hit_at_5": hit5 / total,
        "hit_at_10": hit10 / total,
        "mrr": reciprocal_sum / total,
    }


def _localization_metrics(
    docs: list[str],
    truth_spans: dict[str, list[tuple[int, int]]],
    pred_spans: dict[str, list[tuple[int, int]]],
) -> dict[str, float]:
    true_total = 0
    pred_total = 0
    overlap_total = 0

    for suspicious_file in docs:
        truth = truth_spans.get(suspicious_file, [])
        pred = pred_spans.get(suspicious_file, [])
        true_total += total_interval_length(truth)
        pred_total += total_interval_length(pred)
        overlap_total += overlap_length(truth, pred)

    precision = (overlap_total / pred_total) if pred_total else 0.0
    recall = (overlap_total / true_total) if true_total else 0.0
    if precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2 * precision * recall / (precision + recall)

    return {
        "truth_chars": true_total,
        "predicted_chars": pred_total,
        "overlap_chars": overlap_total,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def evaluate(args: argparse.Namespace) -> dict:
    subset_files = _load_subset(args.split_json, args.subset) if args.subset != "all" else None
    truth = _load_truth(args.manifest_db, subset_files)
    retrieval = _load_retrieval(args.retrieval_csv)
    pred_spans = _load_spans(args.spans_csv)
    runtime = _load_runtime(args.runtime_csv)

    overall_retrieval = _retrieval_metrics(
        docs=truth["plag_docs"],
        retrieval=retrieval,
        relevant_sources=truth["relevant_sources"],
    )
    overall_localization = _localization_metrics(
        docs=truth["plag_docs"],
        truth_spans=truth["truth_spans"],
        pred_spans=pred_spans,
    )

    clean_docs = truth["clean_docs"]
    false_positive_docs = 0
    for suspicious_file in clean_docs:
        ranked = retrieval.get(suspicious_file, [])
        if any(score >= args.fp_threshold for _, _, score in ranked):
            false_positive_docs += 1

    type_metrics = {}
    for type_name in ("artificial", "simulated", "translation"):
        docs_for_type = sorted(
            [
                doc
                for doc in truth["plag_docs"]
                if type_name in truth["type_map"].get(doc, set())
            ]
        )
        type_metrics[type_name] = {
            "retrieval": _retrieval_metrics(docs_for_type, retrieval, truth["relevant_sources"]),
            "localization": _localization_metrics(docs_for_type, truth["truth_spans"], pred_spans),
        }

    obf_metrics = {}
    all_obf_values = sorted({value for values in truth["obf_map"].values() for value in values})
    for obf in all_obf_values:
        docs_for_obf = sorted(
            [doc for doc in truth["plag_docs"] if obf in truth["obf_map"].get(doc, set())]
        )
        obf_metrics[obf] = {
            "retrieval": _retrieval_metrics(docs_for_obf, retrieval, truth["relevant_sources"]),
            "localization": _localization_metrics(docs_for_obf, truth["truth_spans"], pred_spans),
        }

    runtime_summary = {
        "count": len(runtime),
        "avg_seconds": (sum(runtime) / len(runtime)) if runtime else 0.0,
        "median_seconds": percentile(runtime, 50),
        "p95_seconds": percentile(runtime, 95),
        "throughput_docs_per_min": (60.0 / (sum(runtime) / len(runtime))) if runtime and sum(runtime) > 0 else 0.0,
    }

    result = {
        "variant": args.variant,
        "subset": args.subset,
        "counts": {
            "all_docs": len(truth["all_docs"]),
            "plag_docs": len(truth["plag_docs"]),
            "clean_docs": len(clean_docs),
        },
        "retrieval": overall_retrieval,
        "localization": overall_localization,
        "clean_doc_false_positive_rate": (false_positive_docs / len(clean_docs)) if clean_docs else 0.0,
        "clean_doc_false_positive_count": false_positive_docs,
        "runtime": runtime_summary,
        "by_type": type_metrics,
        "by_obfuscation": obf_metrics,
        "inputs": {
            "manifest_db": str(args.manifest_db),
            "retrieval_csv": str(args.retrieval_csv),
            "spans_csv": str(args.spans_csv),
            "runtime_csv": str(args.runtime_csv),
            "split_json": str(args.split_json),
        },
    }
    return result


def main() -> None:
    args = parse_args()
    metrics = evaluate(args)
    output_json = args.output_json or (ARTIFACTS_DIR / f"metrics_{args.variant.lower()}_{args.subset}.json")
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Metrics written: {output_json}")


if __name__ == "__main__":
    main()

