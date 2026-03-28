"""
Sentence-level matching for plagiarism detection highlighting.

Computes which sentences in a submission match sentences in a corpus document,
providing position information for frontend highlighting.
"""

import math
from typing import Dict, List

from .text_processing import TextProcessor
from .tfidf import TFIDFCalculator


def compute_sentence_similarity(
    sentence1_ngrams: List[str],
    sentence2_ngrams: List[str],
    cached_idf: Dict[str, float],
    default_idf: float = 1.0
) -> float:
    """
    Compute TF-IDF cosine similarity between two sentences.

    Args:
        sentence1_ngrams: N-grams from first sentence
        sentence2_ngrams: N-grams from second sentence
        cached_idf: Pre-computed IDF dictionary
        default_idf: Default IDF for terms not in cache

    Returns:
        Cosine similarity score (0.0 - 1.0)
    """
    if not sentence1_ngrams or not sentence2_ngrams:
        return 0.0

    # Compute TF for both sentences
    tf1 = TFIDFCalculator.compute_tf(sentence1_ngrams)
    tf2 = TFIDFCalculator.compute_tf(sentence2_ngrams)

    set1 = set(sentence1_ngrams)
    set2 = set(sentence2_ngrams)
    shared_terms = set1 & set2

    if not shared_terms:
        return 0.0

    # Dot product (only shared terms contribute)
    dot = sum(
        (tf1.get(t, 0.0) * cached_idf.get(t, default_idf)) *
        (tf2.get(t, 0.0) * cached_idf.get(t, default_idf))
        for t in shared_terms
    )

    # Norms
    norm1_sq = sum(
        (tf1.get(t, 0.0) * cached_idf.get(t, default_idf)) ** 2
        for t in set1
    )
    norm2_sq = sum(
        (tf2.get(t, 0.0) * cached_idf.get(t, default_idf)) ** 2
        for t in set2
    )

    norm1 = math.sqrt(norm1_sq) if norm1_sq > 0 else 0
    norm2 = math.sqrt(norm2_sq) if norm2_sq > 0 else 0

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot / (norm1 * norm2)


def compute_sentence_matches(
    submission_text: str,
    corpus_text: str,
    cached_idf: Dict[str, float],
    threshold: float = 0.3,
    top_n: int = 20
) -> Dict:
    """
    Compute detailed sentence-level matches between submission and corpus document.

    Args:
        submission_text: Full text of the submitted document
        corpus_text: Full text of the corpus document
        cached_idf: Pre-computed IDF dictionary from corpus cache
        threshold: Minimum similarity score to count as a match (0.0 - 1.0)
        top_n: Maximum number of matches to return

    Returns:
        {
            'matches': [
                {
                    'submission_sentence': {'text': str, 'start': int, 'end': int, 'index': int},
                    'corpus_sentence': {'text': str, 'start': int, 'end': int, 'index': int},
                    'similarity': float
                }
            ],
            'submission_highlight_ranges': [
                {'start': int, 'end': int, 'similarity': float}
            ]
        }
    """
    result = {
        'matches': [],
        'submission_highlight_ranges': []
    }

    if not submission_text or not corpus_text:
        return result

    # Split both texts into sentences
    sub_sentences = TextProcessor.split_into_sentences(submission_text)
    corp_sentences = TextProcessor.split_into_sentences(corpus_text)

    if not sub_sentences or not corp_sentences:
        return result

    # Pre-compute n-grams for all sentences
    sub_ngrams = []
    for sent in sub_sentences:
        ngrams = TextProcessor.preprocess_for_tfidf(sent['text'])
        sub_ngrams.append(ngrams)

    corp_ngrams = []
    for sent in corp_sentences:
        ngrams = TextProcessor.preprocess_for_tfidf(sent['text'])
        corp_ngrams.append(ngrams)

    # Default IDF for terms not in cache
    default_idf = 1.0

    # Find best match for each submission sentence
    all_matches = []
    matched_sub_indices = set()

    for sub_idx, sub_sent in enumerate(sub_sentences):
        sub_sent_ngrams = sub_ngrams[sub_idx]
        if not sub_sent_ngrams:
            continue

        best_match = None
        best_similarity = 0.0

        for corp_idx, corp_sent in enumerate(corp_sentences):
            corp_sent_ngrams = corp_ngrams[corp_idx]
            if not corp_sent_ngrams:
                continue

            similarity = compute_sentence_similarity(
                sub_sent_ngrams,
                corp_sent_ngrams,
                cached_idf,
                default_idf
            )

            if similarity >= threshold and similarity > best_similarity:
                best_similarity = similarity
                best_match = {
                    'submission_sentence': sub_sent,
                    'corpus_sentence': corp_sent,
                    'similarity': round(similarity, 4)
                }

        if best_match:
            all_matches.append(best_match)
            matched_sub_indices.add(sub_idx)

    # Sort by similarity (highest first) and take top N
    all_matches.sort(key=lambda x: x['similarity'], reverse=True)
    result['matches'] = all_matches[:top_n]

    # Build highlight ranges from matches
    highlight_ranges = []
    highest_match_score = 0.0

    for match in result['matches']:
        sub_sent = match['submission_sentence']
        highlight_ranges.append({
            'start': sub_sent['start'],
            'end': sub_sent['end'],
            'similarity': match['similarity']
        })
        
        if match['similarity'] > highest_match_score:
            highest_match_score = match['similarity']

    # Sort by position for frontend rendering
    highlight_ranges.sort(key=lambda x: x['start'])
    result['submission_highlight_ranges'] = highlight_ranges
    result['highest_match_score'] = highest_match_score

    return result
