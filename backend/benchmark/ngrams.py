from typing import Iterable, Sequence

from backend.app.utils.text_processing import TextProcessor


def preprocess_for_variant(text: str, n_values: Sequence[int], max_words: int | None = None) -> list[str]:
    """Variant-aware preprocessing with shared cleanup/lemmatization.

    When n_values=(2, 3) this is functionally identical to
    TextProcessor.preprocess_for_tfidf(), which is the production code path.
    Use variant "B2T3" to benchmark the exact same algorithm the app uses.
    """
    if max_words:
        text = " ".join(text.split()[:max_words])
    tokens = TextProcessor.clean_text(text, remove_stopwords=True)
    if not tokens:
        return []

    terms: list[str] = []
    for n in n_values:
        if n == 1:
            terms.extend(tokens)
        elif n > 1:
            terms.extend(TextProcessor.generate_ngrams(tokens, n))
    return terms


def normalize_variant_name(name: str) -> str:
    return name.strip().upper().replace("+", "")


def iter_text_files(root) -> Iterable:
    """Yield *.txt files under root sorted by path for deterministic runs."""
    from pathlib import Path

    root_path = Path(root)
    for path in sorted(root_path.rglob("*.txt")):
        if path.is_file():
            yield path

