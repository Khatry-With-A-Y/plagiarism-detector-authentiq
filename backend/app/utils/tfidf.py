import math
from collections import Counter

class TFIDFCalculator:
    """Handles TF-IDF calculations"""
    
    @staticmethod
    def compute_tf(doc_words):
        """Term Frequency: count / total words in this document"""
        total_words = len(doc_words)
        if total_words == 0:
            return {}
        counts = Counter(doc_words)
        return {word: count / total_words for word, count in counts.items()}
    
    @staticmethod
    def compute_idf(all_docs_words):
        """Inverse Document Frequency: log(N / (1 + df)) with smoothing"""
        N = len(all_docs_words)
        if N == 0:
            return {}
        df = Counter()
        for words in all_docs_words:
            df.update(set(words))  # count docs containing each term
        idf = {}
        for term, count in df.items():
            idf[term] = math.log(N / (1 + count))
        return idf
    
    @staticmethod
    def compute_tfidf_vector(tf, idf, all_terms):
        """Create sparse TF-IDF vector as dict {term: value}"""
        vector = {}
        for term in all_terms:
            tf_val = tf.get(term, 0.0)
            idf_val = idf.get(term, 0.0)
            tfidf_val = tf_val * idf_val
            if tfidf_val > 0:  # only store non-zero to reduce bloat
                vector[term] = tfidf_val
        return vector