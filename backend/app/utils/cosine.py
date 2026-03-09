import math
from typing import List, Dict, Tuple

from .text_processing import TextProcessor
from .tfidf import TFIDFCalculator

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