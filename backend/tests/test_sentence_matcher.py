"""
Test cases for sentence_matcher.py

Run from backend directory:
    python tests/test_sentence_matcher.py
"""

import sys
import os

# Add root directory to path so we can import backend as a module
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
sys.path.insert(0, root_dir)

from backend.app.utils.sentence_matcher import compute_sentence_matches

def test_highest_match_score():
    print("=" * 60)
    print("TEST 1: HIGHEST MATCH SCORE CALCULATION")
    print("=" * 60)
    
    submission_text = "This is a completely original sentence. However, this sentence is heavily copied from the source document!"
    corpus_text = "Here is some background text. this sentence is heavily copied from the source document! And some more text."
    
    # Mock an IDF dictionary
    cached_idf = {
        'this': 1.0,
        'sentence': 2.0,
        'is': 1.0,
        'heavily': 3.0,
        'copied': 3.0,
        'from': 1.0,
        'the': 1.0,
        'source': 2.5,
        'document': 2.5,
        'completely': 3.0,
        'original': 3.0
    }
    
    result = compute_sentence_matches(submission_text, corpus_text, cached_idf)
    
    assert 'highest_match_score' in result, "highest_match_score should be in result"
    assert result['highest_match_score'] > 0.7, f"Score should be high, got {result['highest_match_score']}"
    assert len(result['matches']) > 0, "Should find matches"
    
    max_score = max(m['similarity'] for m in result['matches'])
    assert result['highest_match_score'] == max_score, f"highest_match_score {result['highest_match_score']} does not match max similarity {max_score}"
    
    print("PASSED: highest_match_score calculated correctly\n")

def test_highest_match_score_no_matches():
    print("=" * 60)
    print("TEST 2: NO MATCHES")
    print("=" * 60)
    
    submission_text = "Nothing in common here."
    corpus_text = "Totally different words and phrasing."
    
    cached_idf = {}
    
    result = compute_sentence_matches(submission_text, corpus_text, cached_idf, threshold=0.5)
    
    assert 'highest_match_score' in result, "highest_match_score should be in result"
    assert result['highest_match_score'] == 0.0, f"Expected 0.0 for no matches, got {result['highest_match_score']}"
    
    print("PASSED: highest_match_score is 0.0 when no matches exist\n")

if __name__ == '__main__':
    try:
        test_highest_match_score()
        test_highest_match_score_no_matches()
        print("ALL TESTS PASSED SUCCESSFULLY.")
    except AssertionError as e:
        print(f"TEST FAILED: {e}")
        sys.exit(1)
