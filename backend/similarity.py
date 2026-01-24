import math
from collections import Counter
import re
from typing import List, Dict, Tuple

class TextProcessor:
    """Handles text cleaning and preprocessing"""
    
    @staticmethod
    def simple_stem(word):
        """Very basic stemming without external libraries"""
        if word.endswith('s'):   return word[:-1]
        if word.endswith('es'):  return word[:-2]
        if word.endswith('ing'): return word[:-3]
        if word.endswith('ed'):  return word[:-2]
        return word
    
    @staticmethod
    def clean_text(text):
        """Clean and preprocess text: lowercase, remove punctuation, simple stem"""
        text = text.lower()
        text = re.sub(r'[^a-z\s]', '', text)  # remove non-letter characters
        words = text.split()
        return [TextProcessor.simple_stem(w) for w in words if w]  # remove empty strings

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
            if tfidf_val > 0:  # only store non-zero for sparsity
                vector[term] = tfidf_val
        return vector

class SimilarityEngine:
    """Main engine for computing document similarity"""
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.tfidf_calculator = TFIDFCalculator()
    
    def cosine_similarity(self, vec1, vec2):
        """Cosine similarity between two sparse dict vectors"""
        common_terms = set(vec1.keys()) & set(vec2.keys())
        dot = sum(vec1[term] * vec2[term] for term in common_terms)
        norm1 = math.sqrt(sum(v**2 for v in vec1.values()))
        norm2 = math.sqrt(sum(v**2 for v in vec2.values()))
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot / (norm1 * norm2)
    
    def process_submission(self, submission_text: str, corpus_texts: List[Tuple[int, str]]) -> List[Dict]:
        """
        Process a submission against a corpus and return ranked similarity results.
        
        Args:
            submission_text: The text content of the submitted document
            corpus_texts: List of tuples (paper_id, text_content) for corpus papers
        
        Returns:
            List of dicts with keys: paper_id, similarity_score, sorted by score descending
        """
        if not corpus_texts:
            return []
        
        # Preprocess submission
        submission_words = self.text_processor.clean_text(submission_text)
        
        # Preprocess all corpus documents
        corpus_words_list = []
        for paper_id, text in corpus_texts:
            words = self.text_processor.clean_text(text)
            corpus_words_list.append((paper_id, words))
        
        # Build shared vocabulary from corpus + submission
        all_docs_words = [words for _, words in corpus_words_list] + [submission_words]
        all_terms = sorted(set(word for doc_words in all_docs_words for word in doc_words))
        
        # Compute global IDF from corpus
        corpus_only_words = [words for _, words in corpus_words_list]
        if corpus_only_words:
            idf = self.tfidf_calculator.compute_idf(corpus_only_words + [submission_words])
        else:
            idf = {}
        
        # Compute TF-IDF vector for submission
        submission_tf = self.tfidf_calculator.compute_tf(submission_words)
        submission_vector = self.tfidf_calculator.compute_tfidf_vector(submission_tf, idf, all_terms)
        
        # Compute TF-IDF vectors for corpus and calculate similarities
        results = []
        for paper_id, words in corpus_words_list:
            corpus_tf = self.tfidf_calculator.compute_tf(words)
            corpus_vector = self.tfidf_calculator.compute_tfidf_vector(corpus_tf, idf, all_terms)
            similarity = self.cosine_similarity(submission_vector, corpus_vector)
            results.append({
                'paper_id': paper_id,
                'similarity_score': similarity
            })
        
        # Sort by similarity score descending
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        return results

# Convenience function for easy usage
def process_submission(submission_text: str, corpus_texts: List[Tuple[int, str]]) -> List[Dict]:
    """
    Convenience function to process a submission.
    
    Args:
        submission_text: The text content of the submitted document
        corpus_texts: List of tuples (paper_id, text_content) for corpus papers
    
    Returns:
        List of dicts with keys: paper_id, similarity_score, sorted by score descending
    """
    engine = SimilarityEngine()
    return engine.process_submission(submission_text, corpus_texts)
