import re

class TextProcessor:
    """Handles text cleaning and preprocessing"""

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

    @staticmethod
    def simple_stem(word):
        """Very basic stemming without external libraries"""
        if word.endswith('s'):   return word[:-1]
        if word.endswith('es'):  return word[:-2]
        if word.endswith('ing'): return word[:-3]
        if word.endswith('ed'):  return word[:-2]
        return word

    @staticmethod
    def clean_text(text, remove_stopwords=False):
        """Clean and preprocess text: lowercase, remove punctuation, simple stem"""
        text = text.lower()
        text = re.sub(r'[^a-z\s]', '', text)  # remove non-letter characters
        words = text.split()
        words = [TextProcessor.simple_stem(w) for w in words if w]
        if remove_stopwords:
            words = [w for w in words if w not in TextProcessor.STOPWORDS]
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