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
            
            # Norms (use set() to count each unique term once, matching dot product)
            norm_sub = math.sqrt(sum((sub_tf.get(t, 0.0) * idf[t])**2 for t in set(sub_words) if t in idf))
            norm_corp = math.sqrt(sum((corp_tf.get(t, 0.0) * idf[t])**2 for t in set(corp_words) if t in idf))
            
            if norm_sub > 0 and norm_corp > 0:
                similarity = dot / (norm_sub * norm_corp)
                if similarity > 0.0001:
                    results.append({'paper_id': paper_id, 'similarity_score': similarity})
                    
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        return results

    def process_submission_cached(self, submission_text: str, corpus_preprocessed: List[Tuple[int, List[str]]]) -> List[Dict]:
        """
        Process a submission against a corpus using pre-computed n-grams (FAST).

        Args:
            submission_text: The text content of the submitted document
            corpus_preprocessed: List of tuples (paper_id, ngrams_list) with pre-computed n-grams

        Returns:
            List of dicts with keys: paper_id, similarity_score, sorted by score descending
        """
        if not corpus_preprocessed:
            return []

        # 1. Preprocess submission (only this needs to be computed)
        sub_words = self.text_processor.preprocess_for_tfidf(submission_text)
        sub_tf = self.tfidf_calculator.compute_tf(sub_words)

        # 2. Collect all doc word sets for IDF (corpus already preprocessed!)
        all_docs_words = [sub_words]
        for paper_id, ngrams in corpus_preprocessed:
            all_docs_words.append(ngrams)

        # 3. Compute IDF once for everything
        idf = self.tfidf_calculator.compute_idf(all_docs_words)

        # 4. Compare against corpus docs
        results = []
        sub_words_set = set(sub_words)

        for paper_id, corp_words in corpus_preprocessed:
            # Only compute if they share terms with the submission
            corp_words_set = set(corp_words)
            shared_terms = sub_words_set & corp_words_set
            if not shared_terms:
                continue

            corp_tf = self.tfidf_calculator.compute_tf(corp_words)

            # Dot product
            dot = sum((sub_tf.get(t, 0.0) * idf[t]) * (corp_tf.get(t, 0.0) * idf[t]) for t in shared_terms)

            # Norms (use set() to count each unique term once)
            norm_sub = math.sqrt(sum((sub_tf.get(t, 0.0) * idf[t])**2 for t in sub_words_set if t in idf))
            norm_corp = math.sqrt(sum((corp_tf.get(t, 0.0) * idf[t])**2 for t in corp_words_set if t in idf))

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


def process_submission_cached(submission_text: str, corpus_preprocessed: List[Tuple[int, List[str]]]) -> List[Dict]:
    """
    Convenience function to process a submission using cached n-grams (FAST).

    Args:
        submission_text: The text content of the submitted document
        corpus_preprocessed: List of tuples (paper_id, ngrams_list) with pre-computed n-grams

    Returns:
        List of dicts with keys: paper_id, similarity_score, sorted by score descending
    """
    engine = SimilarityEngine()
    return engine.process_submission_cached(submission_text, corpus_preprocessed)


def process_submission_with_cached_idf(
    submission_text: str,
    corpus_preprocessed: List[Tuple[int, List[str]]],
    cached_idf: Dict[str, float]
) -> List[Dict]:
    """
    Process submission using pre-computed IDF from corpus cache (FASTEST).

    This avoids recomputing IDF for every submission - the most expensive operation
    when processing multiple submissions concurrently.

    Args:
        submission_text: The submitted document text
        corpus_preprocessed: List of (paper_id, ngrams_list) tuples
        cached_idf: Pre-computed IDF dictionary from corpus cache

    Returns:
        List of {paper_id, similarity_score} sorted descending
    """
    if not corpus_preprocessed:
        return []

    # 1. Preprocess submission
    sub_words = TextProcessor.preprocess_for_tfidf(submission_text)
    if not sub_words:
        return []

    sub_tf = TFIDFCalculator.compute_tf(sub_words)
    sub_words_set = set(sub_words)

    # 2. Use cached IDF (with fallback for terms only in submission)
    # Terms unique to submission get IDF = log(N / 1) = log(N)
    N = len(corpus_preprocessed)
    default_idf = math.log(N) if N > 0 else 0

    # 3. Compute submission vector norm once (reused for all comparisons)
    norm_sub_sq = sum(
        (sub_tf.get(t, 0.0) * cached_idf.get(t, default_idf))**2
        for t in sub_words_set
    )
    norm_sub = math.sqrt(norm_sub_sq) if norm_sub_sq > 0 else 0

    if norm_sub == 0:
        return []

    # 4. Compare against corpus
    results = []

    for paper_id, corp_words in corpus_preprocessed:
        corp_words_set = set(corp_words)
        shared_terms = sub_words_set & corp_words_set

        if not shared_terms:
            continue

        corp_tf = TFIDFCalculator.compute_tf(corp_words)

        # Dot product (only shared terms contribute)
        dot = sum(
            (sub_tf.get(t, 0.0) * cached_idf.get(t, default_idf)) *
            (corp_tf.get(t, 0.0) * cached_idf.get(t, default_idf))
            for t in shared_terms
        )

        # Corpus document norm
        norm_corp_sq = sum(
            (corp_tf.get(t, 0.0) * cached_idf.get(t, default_idf))**2
            for t in corp_words_set
        )
        norm_corp = math.sqrt(norm_corp_sq) if norm_corp_sq > 0 else 0

        if norm_corp > 0:
            similarity = dot / (norm_sub * norm_corp)
            if similarity > 0.0001:
                results.append({'paper_id': paper_id, 'similarity_score': similarity})

    results.sort(key=lambda x: x['similarity_score'], reverse=True)
    return results