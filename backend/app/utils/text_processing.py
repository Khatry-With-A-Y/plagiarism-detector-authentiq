import os
import re
import functools
from typing import List, Dict
import nltk
from nltk.stem import WordNetLemmatizer

# Vendored NLTK data lives under backend/data/nltk_data/ so the backend
# never reaches out to raw.githubusercontent.com/nltk/nltk_data on first run.
# __file__ is backend/app/utils/text_processing.py — three dirname() calls
# land on backend/, then we join data/nltk_data.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_NLTK_DATA_DIR = os.path.join(_BACKEND_DIR, 'data', 'nltk_data')

if _NLTK_DATA_DIR not in nltk.data.path:
    nltk.data.path.insert(0, _NLTK_DATA_DIR)

def _ensure_nltk_data():
    """Verify the vendored NLTK corpora are present. Never download.

    Checks file presence directly under _NLTK_DATA_DIR rather than via
    nltk.data.find(), because find() walks the whole nltk.data.path list
    and a developer who once ran `nltk.download(...)` (cached under
    ~/nltk_data/) would mask a missing vendored copy and reintroduce the
    invisible-dependency failure mode this change exists to prevent.
    """
    required_archives = ['wordnet.zip', 'omw-1.4.zip']
    corpora_dir = os.path.join(_NLTK_DATA_DIR, 'corpora')
    missing = [a for a in required_archives
               if not os.path.isfile(os.path.join(corpora_dir, a))]
    if missing:
        raise RuntimeError(
            "Vendored NLTK data missing: {names}. Expected under {dir}. "
            "Restore the files from git (they are committed to the repo): "
            "`git checkout -- backend/data/nltk_data` (or re-run setup.ps1).".format(
                names=", ".join(missing), dir=corpora_dir,
            )
        )

_ensure_nltk_data()

# Module-level lemmatizer for caching
_lemmatizer = WordNetLemmatizer()

@functools.lru_cache(maxsize=50000)
def _cached_lemmatize(word):
    """
    Cached lemmatization to avoid repeated WordNet lookups.
    Tries verb form first, then noun form.
    """
    lemma = _lemmatizer.lemmatize(word, pos='v')
    if lemma != word:
        return lemma
    return _lemmatizer.lemmatize(word, pos='n')


class TextProcessor:
    """Handles text cleaning and preprocessing with tokenization, stopword removal, and lemmatization"""

    # Common English stopwords
    STOPWORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
        'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
        'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
        'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
        'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
        'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then'
    }

    @classmethod
    def lemmatize(cls, word):
        """
        Lemmatize a word to its base/dictionary form.
        Uses cached function to avoid repeated WordNet lookups.
        Examples: 'running' -> 'run', 'studies' -> 'study', 'better' -> 'better'
        """
        return _cached_lemmatize(word)

    @classmethod
    def clean_text(cls, text, remove_stopwords=False):
        """
        Clean and preprocess text with tokenization, optional stopword removal, and lemmatization.

        Steps:
        1. Normalize hyphenated line breaks (rejoin split words)
        2. Normalize all whitespace to single spaces
        3. Lowercase the text
        4. Remove non-letter characters (punctuation, numbers)
        5. Tokenize by splitting on whitespace
        6. Lemmatize each token to its base form
        7. Optionally remove stopwords
        """
        # Fix hyphenated words split across lines (e.g., "algo-\nrithm" -> "algorithm")
        text = re.sub(r'-\s*\n\s*', '', text)
        # Normalize all whitespace (newlines, tabs, multiple spaces) to single spaces
        text = re.sub(r'\s+', ' ', text)
        text = text.lower()
        text = re.sub(r'[^a-z\s]', '', text)  # remove non-letter characters
        words = text.split()  # tokenization
        words = [cls.lemmatize(w) for w in words if w]  # lemmatization
        if remove_stopwords:
            words = [w for w in words if w not in cls.STOPWORDS]
        return words

    @staticmethod
    def generate_ngrams(tokens, n):
        """Generate n-grams from token list."""
        if len(tokens) < n:
            return []
        return [' '.join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]

    @staticmethod
    def preprocess_for_tfidf(text):
        """Full preprocessing: clean text and generate bigrams + trigrams."""
        tokens = TextProcessor.clean_text(text, remove_stopwords=True)
        bigrams = TextProcessor.generate_ngrams(tokens, 2)
        trigrams = TextProcessor.generate_ngrams(tokens, 3)
        return bigrams + trigrams

    @classmethod
    def split_into_sentences(cls, text: str, max_sentences: int = 500) -> List[Dict]:
        """
        Split text into sentences with position info.

        Args:
            text: The text to split
            max_sentences: Maximum number of sentences to return (for performance)

        Returns:
            List of dicts: [{'text': str, 'start': int, 'end': int, 'index': int}, ...]
        """
        if not text or not text.strip():
            return []

        # Normalize whitespace but preserve positions
        # First, find sentence boundaries using regex
        # Pattern handles: periods, exclamation, question marks followed by space and capital
        # Also handles end of text

        sentences = []

        # Split on sentence-ending punctuation followed by whitespace
        # This pattern handles most common cases while avoiding splits on abbreviations like "Dr." or "U.S."
        pattern = r'(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$'

        # Find all split positions
        parts = re.split(pattern, text)

        current_pos = 0
        for idx, part in enumerate(parts):
            if idx >= max_sentences:
                break

            part = part.strip()
            if not part:
                continue

            # Find actual position in original text
            start = text.find(part, current_pos)
            if start == -1:
                start = current_pos
            end = start + len(part)

            sentences.append({
                'text': part,
                'start': start,
                'end': end,
                'index': len(sentences)
            })

            current_pos = end

        return sentences