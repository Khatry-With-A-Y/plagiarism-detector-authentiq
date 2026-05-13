import argparse
import json
import random
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.benchmark.config import DEFAULT_DEV_RATIO, DEFAULT_MAX_PER_STRATUM, DEFAULT_RANDOM_SEED, MANIFEST_DB_DEFAULT, SPLIT_JSON_DEFAULT  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create deterministic dev/test split for PAN suspicious docs.")
    parser.add_argument("--manifest-db", type=Path, default=MANIFEST_DB_DEFAULT)
    parser.add_argument("--output", type=Path, default=SPLIT_JSON_DEFAULT)
    parser.add_argument("--dev-ratio", type=float, default=DEFAULT_DEV_RATIO)
    parser.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    parser.add_argument(
        "--suspicious-language",
        type=str,
        default=None,
        help="Optional language filter for suspicious docs (e.g., en).",
    )
    parser.add_argument(
        "--source-language",
        type=str,
        default=None,
        help="Optional source-language filter for plagiarism cases (e.g., en).",
    )
    parser.add_argument(
        "--source-language-mode",
        choices=["all", "any"],
        default="all",
        help="For plagiarized docs, require all cases or any case to match --source-language.",
    )
    parser.add_argument(
        "--max-total",
        type=int,
        default=None,
        help="Optional cap on total documents to include in the split (sampled after filtering).",
    )
    parser.add_argument(
        "--max-per-stratum",
        type=int,
        default=None,
        help="Cap each stratum independently at N docs before dev/test split (default: no cap).",
    )
    return parser.parse_args()


def _dominant_type_map(conn: sqlite3.Connection) -> dict[str, str]:
    cursor = conn.cursor()
    rows = cursor.execute(
        """
        SELECT suspicious_file, plagiarism_type, COUNT(*) AS cnt
        FROM plagiarism_cases
        GROUP BY suspicious_file, plagiarism_type
        """
    ).fetchall()

    dominant: dict[str, tuple[str, int]] = {}
    for suspicious_file, plagiarism_type, cnt in rows:
        if suspicious_file not in dominant or cnt > dominant[suspicious_file][1]:
            dominant[suspicious_file] = (plagiarism_type or "unknown", int(cnt))
    return {k: v[0] for k, v in dominant.items()}


def _source_language_map(conn: sqlite3.Connection) -> dict[str, set[str]]:
    cursor = conn.cursor()
    rows = cursor.execute(
        """
        SELECT suspicious_file, source_language
        FROM plagiarism_cases
        """
    ).fetchall()
    mapping: dict[str, set[str]] = defaultdict(set)
    for suspicious_file, source_language in rows:
        if source_language:
            mapping[suspicious_file].add(str(source_language).lower())
    return mapping


def _passes_source_language_filter(
    suspicious_file: str,
    has_plagiarism: int,
    source_lang_map: dict[str, set[str]],
    source_language: str | None,
    mode: str,
) -> bool:
    if source_language is None:
        return True
    if not has_plagiarism:
        return True  # keep clean docs in filtered evaluations

    langs = source_lang_map.get(suspicious_file, set())
    if not langs:
        return False
    if mode == "any":
        return source_language in langs
    return langs == {source_language}


def create_split(
    manifest_db: Path,
    output: Path,
    dev_ratio: float,
    seed: int,
    suspicious_language: str | None,
    source_language: str | None,
    source_language_mode: str,
    max_total: int | None = None,
    max_per_stratum: int | None = None,
) -> None:
    if not manifest_db.exists():
        raise FileNotFoundError(f"Manifest DB not found: {manifest_db}")
    if dev_ratio <= 0 or dev_ratio >= 1:
        raise ValueError("--dev-ratio must be between 0 and 1")

    conn = sqlite3.connect(manifest_db)
    cursor = conn.cursor()
    dominant_type = _dominant_type_map(conn)

    source_lang_map = _source_language_map(conn)
    rows = cursor.execute(
        """
        SELECT suspicious_file, has_plagiarism, language
        FROM suspicious_documents
        ORDER BY suspicious_file
        """
    ).fetchall()
    conn.close()

    strata: dict[str, list[str]] = defaultdict(list)
    suspicious_language = suspicious_language.lower() if suspicious_language else None
    source_language = source_language.lower() if source_language else None

    for suspicious_file, has_plagiarism, language in rows:
        doc_language = (language or "").lower()
        if suspicious_language and doc_language != suspicious_language:
            continue
        if not _passes_source_language_filter(
            suspicious_file=suspicious_file,
            has_plagiarism=has_plagiarism,
            source_lang_map=source_lang_map,
            source_language=source_language,
            mode=source_language_mode,
        ):
            continue

        label = "none"
        if has_plagiarism:
            label = dominant_type.get(suspicious_file, "unknown")
        stratum_key = f"{int(has_plagiarism)}::{label}"
        strata[stratum_key].append(suspicious_file)

    if not strata:
        raise ValueError("No suspicious documents matched the requested filters.")

    rng = random.Random(seed)
    dev_files: list[str] = []
    test_files: list[str] = []

    # If max_per_stratum is set, cap each stratum independently
    if max_per_stratum is not None:
        for key in list(strata.keys()):
            files = strata[key]
            if len(files) > max_per_stratum:
                rng.shuffle(files)
                strata[key] = files[:max_per_stratum]

    # If max_total is set, we sample from each stratum proportionally
    elif max_total is not None:
        total_available = sum(len(files) for files in strata.values())
        if max_total < total_available:
            for key in list(strata.keys()):
                files = strata[key]
                # Proportionate share of max_total
                stratum_limit = int(max_total * (len(files) / total_available))
                rng.shuffle(files)
                strata[key] = files[:stratum_limit]

    for files in strata.values():
        rng.shuffle(files)
        dev_count = int(len(files) * dev_ratio)
        if len(files) > 1 and dev_count == 0:
            dev_count = 1
        if dev_count >= len(files):
            dev_count = len(files) - 1

        dev_files.extend(files[:dev_count])
        test_files.extend(files[dev_count:])

    dev_files.sort()
    test_files.sort()

    payload = {
        "manifest_db": str(manifest_db),
        "seed": seed,
        "dev_ratio": dev_ratio,
        "suspicious_language_filter": suspicious_language,
        "source_language_filter": source_language,
        "source_language_mode": source_language_mode,
        "strata_count": len(strata),
        "max_per_stratum": max_per_stratum,
        "dev_count": len(dev_files),
        "test_count": len(test_files),
        "dev_suspicious_files": dev_files,
        "test_suspicious_files": test_files,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Split file written: {output}")
    print(f"Dev docs: {len(dev_files)}")
    print(f"Test docs: {len(test_files)}")


def main() -> None:
    args = parse_args()
    create_split(
        manifest_db=args.manifest_db,
        output=args.output,
        dev_ratio=args.dev_ratio,
        seed=args.seed,
        suspicious_language=args.suspicious_language,
        source_language=args.source_language,
        source_language_mode=args.source_language_mode,
        max_total=args.max_total,
        max_per_stratum=args.max_per_stratum,
    )


if __name__ == "__main__":
    main()

