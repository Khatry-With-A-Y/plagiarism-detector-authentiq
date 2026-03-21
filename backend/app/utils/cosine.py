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
        """
        if not corpus_texts:
            return []
        
        # 1. Preprocess submission
        sub_words = self.text_processor.preprocess_for_tfidf(submission_text)
        sub_tf = self.tfidf_calculator.compute_tf(sub_words)
        
        # 2. Collect all doc word sets for IDF (including submission)
        # Optimization: IDF needs to know how many documents each term appears in.
        all_docs_words = [sub_words]
        corpus_words_map = {}
        for paper_id, text in corpus_texts:
            words = self.text_processor.preprocess_for_tfidf(text)
            all_docs_words.append(words)
            corpus_words_map[paper_id] = words
            
        # 3. Compute IDF once for everything
        idf = self.tfidf_calculator.compute_idf(all_docs_words)
        
        # 4. Compute submission vector
        # Optimization: only compute for terms present in sub_words
        sub_vector = {}
        for term in set(sub_words):
            if term in idf:
                sub_vector[term] = sub_tf.get(term, 0.0) * idf[term]
        
        # 5. Compare against corpus docs
        results = []
        for paper_id, corp_words in corpus_words_map.items():
            # Only compute if they share terms with the submission
            shared_terms = set(sub_words) & set(corp_words)
            if not shared_terms:
                continue
                
            corp_tf = self.tfidf_calculator.compute_tf(corp_words)
            # Compute corp_vector only for relevant terms (either shared or all terms in corp doc for norm)
            # Actually, for cosine similarity, we need the full vector for normalization
            # but we only need dot product for shared terms.
            
            # Dot product
            dot = sum((sub_tf.get(t, 0.0) * idf[t]) * (corp_tf.get(t, 0.0) * idf[t]) for t in shared_terms)
            
            # Norms
            norm_sub = math.sqrt(sum((sub_tf.get(t, 0.0) * idf[t])**2 for t in sub_words if t in idf))
            norm_corp = math.sqrt(sum((corp_tf.get(t, 0.0) * idf[t])**2 for t in corp_words if t in idf))
            
            if norm_sub > 0 and norm_corp > 0:
                similarity = dot / (norm_sub * norm_corp)
                if similarity > 0.0001:
                    results.append({'paper_id': paper_id, 'similarity_score': similarity})
                    
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