import argparse
import csv
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


if __package__ is None or __package__ == "":
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from backend.benchmark.config import (  # noqa: E402
    EXTERNAL_CORPUS_DIR_DEFAULT,
    MANIFEST_CSV_DEFAULT,
    MANIFEST_DB_DEFAULT,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build PAN 2011 external-corpus manifest.")
    parser.add_argument("--external-corpus-dir", type=Path, default=EXTERNAL_CORPUS_DIR_DEFAULT)
    parser.add_argument("--output-db", type=Path, default=MANIFEST_DB_DEFAULT)
    parser.add_argument("--output-csv", type=Path, default=MANIFEST_CSV_DEFAULT)
    parser.add_argument("--max-files", type=int, default=None, help="Optional cap for quick smoke runs.")
    return parser.parse_args()


def _feature_attrs(root: ET.Element, feature_name: str) -> list[dict[str, str]]:
    attrs: list[dict[str, str]] = []
    for feature in root.findall("feature"):
        if feature.attrib.get("name") == feature_name:
            attrs.append(feature.attrib)
    return attrs


def _init_db(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.executescript(
        """
        DROP TABLE IF EXISTS source_documents;
        DROP TABLE IF EXISTS suspicious_documents;
        DROP TABLE IF EXISTS plagiarism_cases;

        CREATE TABLE source_documents (
            source_file TEXT PRIMARY KEY,
            rel_path TEXT NOT NULL,
            part TEXT NOT NULL,
            language TEXT
        );

        CREATE TABLE suspicious_documents (
            suspicious_file TEXT PRIMARY KEY,
            rel_path TEXT NOT NULL,
            part TEXT NOT NULL,
            language TEXT,
            has_plagiarism INTEGER NOT NULL,
            plagiarism_case_count INTEGER NOT NULL
        );

        CREATE TABLE plagiarism_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            suspicious_file TEXT NOT NULL,
            source_file TEXT NOT NULL,
            plagiarism_type TEXT,
            obfuscation TEXT,
            manual_obfuscation TEXT,
            this_language TEXT,
            source_language TEXT,
            this_offset INTEGER,
            this_length INTEGER,
            source_offset INTEGER,
            source_length INTEGER
        );

        CREATE INDEX idx_cases_suspicious ON plagiarism_cases(suspicious_file);
        CREATE INDEX idx_cases_source ON plagiarism_cases(source_file);
        CREATE INDEX idx_cases_type ON plagiarism_cases(plagiarism_type);
        CREATE INDEX idx_cases_obf ON plagiarism_cases(obfuscation);
        """
    )
    conn.commit()


def _to_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def build_manifest(external_corpus_dir: Path, output_db: Path, output_csv: Path, max_files: int | None) -> None:
    source_root = external_corpus_dir / "source-document"
    suspicious_root = external_corpus_dir / "suspicious-document"

    if not source_root.exists() or not suspicious_root.exists():
        raise FileNotFoundError(
            f"Expected source/suspicious folders under: {external_corpus_dir}"
        )

    output_db.parent.mkdir(parents=True, exist_ok=True)
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(output_db)
    _init_db(conn)
    cursor = conn.cursor()

    source_rows: list[tuple[str, str, str, str | None]] = []
    suspicious_rows: list[tuple[str, str, str, str | None, int, int]] = []
    case_rows: list[tuple] = []

    source_xml_paths = sorted(source_root.rglob("*.xml"))
    suspicious_xml_paths = sorted(suspicious_root.rglob("*.xml"))
    if max_files:
        source_xml_paths = source_xml_paths[:max_files]
        suspicious_xml_paths = suspicious_xml_paths[:max_files]

    for xml_path in source_xml_paths:
        root = ET.parse(xml_path).getroot()
        source_file = root.attrib.get("reference", xml_path.with_suffix(".txt").name)
        about_features = _feature_attrs(root, "about")
        language = about_features[0].get("lang") if about_features else None
        rel_path = str((xml_path.parent / source_file).relative_to(source_root))
        source_rows.append((source_file, rel_path, xml_path.parent.name, language))

    for xml_path in suspicious_xml_paths:
        root = ET.parse(xml_path).getroot()
        suspicious_file = root.attrib.get("reference", xml_path.with_suffix(".txt").name)
        about_features = _feature_attrs(root, "about")
        language = about_features[0].get("lang") if about_features else None
        plagiarism_features = _feature_attrs(root, "plagiarism")

        suspicious_rows.append(
            (
                suspicious_file,
                str((xml_path.parent / suspicious_file).relative_to(suspicious_root)),
                xml_path.parent.name,
                language,
                1 if plagiarism_features else 0,
                len(plagiarism_features),
            )
        )

        for feature in plagiarism_features:
            obfuscation = feature.get("obfuscation")
            manual_obfuscation = feature.get("manual_obfuscation")
            if obfuscation is None and manual_obfuscation is not None:
                obfuscation = f"manual_{manual_obfuscation.lower()}"

            case_rows.append(
                (
                    suspicious_file,
                    feature.get("source_reference"),
                    feature.get("type"),
                    obfuscation,
                    manual_obfuscation,
                    feature.get("this_language"),
                    feature.get("source_language"),
                    _to_int(feature.get("this_offset")),
                    _to_int(feature.get("this_length")),
                    _to_int(feature.get("source_offset")),
                    _to_int(feature.get("source_length")),
                )
            )

    cursor.executemany(
        """
        INSERT OR REPLACE INTO source_documents (source_file, rel_path, part, language)
        VALUES (?, ?, ?, ?)
        """,
        source_rows,
    )
    cursor.executemany(
        """
        INSERT OR REPLACE INTO suspicious_documents
        (suspicious_file, rel_path, part, language, has_plagiarism, plagiarism_case_count)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        suspicious_rows,
    )
    cursor.executemany(
        """
        INSERT INTO plagiarism_cases
        (suspicious_file, source_file, plagiarism_type, obfuscation, manual_obfuscation,
         this_language, source_language, this_offset, this_length, source_offset, source_length)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        case_rows,
    )
    conn.commit()

    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "suspicious_file",
                "source_file",
                "plagiarism_type",
                "obfuscation",
                "manual_obfuscation",
                "this_language",
                "source_language",
                "this_offset",
                "this_length",
                "source_offset",
                "source_length",
            ]
        )
        writer.writerows(case_rows)

    source_count = cursor.execute("SELECT COUNT(*) FROM source_documents").fetchone()[0]
    suspicious_count = cursor.execute("SELECT COUNT(*) FROM suspicious_documents").fetchone()[0]
    case_count = cursor.execute("SELECT COUNT(*) FROM plagiarism_cases").fetchone()[0]
    plag_doc_count = cursor.execute(
        "SELECT COUNT(*) FROM suspicious_documents WHERE has_plagiarism = 1"
    ).fetchone()[0]
    clean_doc_count = suspicious_count - plag_doc_count
    conn.close()

    print(f"Manifest DB written: {output_db}")
    print(f"Manifest CSV written: {output_csv}")
    print(f"Source docs: {source_count}")
    print(f"Suspicious docs: {suspicious_count} ({plag_doc_count} plagiarized, {clean_doc_count} clean)")
    print(f"Plagiarism cases: {case_count}")


def main() -> None:
    args = parse_args()
    build_manifest(
        external_corpus_dir=args.external_corpus_dir,
        output_db=args.output_db,
        output_csv=args.output_csv,
        max_files=args.max_files,
    )


if __name__ == "__main__":
    main()

