import re
import nltk
from nltk.stem import WordNetLemmatizer
from nltk.corpus import wordnet

# Download required NLTK data (only downloads if not present)
def _ensure_nltk_data():
    """Download required NLTK data packages if not already present."""
    required_packages = [
        ('corpora/wordnet', 'wordnet'),
        ('corpora/omw-1.4', 'omw-1.4'),
    ]
    for path, package in required_packages:
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(package, quiet=True)

_ensure_nltk_data()


class TextProcessor:
    """Handles text cleaning and preprocessing with tokenization, stopword removal, and lemmatization"""

    # Shared lemmatizer instance
    _lemmatizer = WordNetLemmatizer()

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
        Tries verb form first, then noun form for best results.
        Examples: 'running' -> 'run', 'studies' -> 'study', 'better' -> 'better'
        """
        # Try as verb first (handles running->run, studies->study)
        lemma = cls._lemmatizer.lemmatize(word, pos='v')
        if lemma != word:
            return lemma
        # Fall back to noun form (handles cats->cat, children->child)
        return cls._lemmatizer.lemmatize(word, pos='n')

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