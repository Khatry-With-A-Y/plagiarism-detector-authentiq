"""
Test cases for text_processing.py

Tests the three core preprocessing requirements:
1. Tokenization - splitting text into words
2. Stop words removal - filtering out common words
3. Lemmatization - reducing words to base/dictionary form

Run from backend directory:
    python tests/test_text_processing.py
"""

import sys
import os

# Add app/utils to path for direct import (avoids app/__init__.py import issues)
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
utils_dir = os.path.join(backend_dir, 'app', 'utils')
sys.path.insert(0, utils_dir)

from text_processing import TextProcessor  # type: ignore


def test_tokenization():
    """Test that text is properly split into tokens."""
    print("=" * 60)
    print("TEST 1: TOKENIZATION")
    print("=" * 60)

    text = "Hello world this is a test"
    tokens = TextProcessor.clean_text(text, remove_stopwords=False)

    print(f"Input:  '{text}'")
    print(f"Tokens: {tokens}")
    print(f"Count:  {len(tokens)} tokens")

    # Verify we got individual words (not the whole string)
    assert len(tokens) == 6, f"Expected 6 tokens, got {len(tokens)}"
    assert isinstance(tokens, list), "Tokens should be a list"
    print("PASSED: Text correctly tokenized into individual words\n")


def test_stopword_removal():
    """Test that stopwords are properly filtered out."""
    print("=" * 60)
    print("TEST 2: STOPWORD REMOVAL")
    print("=" * 60)

    text = "The quick brown fox jumps over the lazy dog and he kept running"

    # Without stopword removal
    tokens_with_stopwords = TextProcessor.clean_text(text, remove_stopwords=False)
    # With stopword removal
    tokens_without_stopwords = TextProcessor.clean_text(text, remove_stopwords=True)

    print(f"Input: '{text}'")
    print(f"With stopwords:    {tokens_with_stopwords}")
    print(f"Without stopwords: {tokens_without_stopwords}")

    # Check that common stopwords were removed ('the' is in STOPWORDS)
    assert 'the' not in tokens_without_stopwords, "Stopword 'the' should be removed"

    # Verify meaningful words are kept
    assert 'quick' in tokens_without_stopwords, "'quick' should be kept"
    assert 'fox' in tokens_without_stopwords, "'fox' should be kept"
    assert 'lazy' in tokens_without_stopwords, "'lazy' should be kept"

    # Verify removal happened
    assert len(tokens_without_stopwords) < len(tokens_with_stopwords), "Some words should be removed"

    print(f"Removed {len(tokens_with_stopwords) - len(tokens_without_stopwords)} stopwords")
    print("PASSED: Stopwords correctly removed\n")


def test_lemmatization():
    """Test that words are properly lemmatized to base forms."""
    print("=" * 60)
    print("TEST 3: LEMMATIZATION")
    print("=" * 60)

    # Test cases: (input_word, expected_lemma)
    test_cases = [
        ("running", "run"),
        ("runs", "run"),
        ("ran", "run"),
        ("studies", "study"),
        ("studying", "study"),
        ("cats", "cat"),
        ("played", "play"),
        ("playing", "play"),
        ("better", "better"),  # Adjectives may not change without POS tagging
        ("dogs", "dog"),
        ("written", "write"),
        ("writing", "write"),
    ]

    print("Testing individual words:")
    print("-" * 40)

    passed = 0
    failed = 0

    for word, expected in test_cases:
        result = TextProcessor.lemmatize(word)
        status = "PASS" if result == expected else "FAIL"
        if result == expected:
            passed += 1
        else:
            failed += 1
        print(f"  '{word}' -> '{result}' (expected: '{expected}') [{status}]")

    print("-" * 40)
    print(f"Results: {passed} passed, {failed} failed")

    # Test in context of full sentence
    print("\nTesting full sentence:")
    sentence = "The students are running quickly and studying various books"
    tokens = TextProcessor.clean_text(sentence, remove_stopwords=True)
    print(f"Input:  '{sentence}'")
    print(f"Output: {tokens}")

    # Check specific lemmatizations in the result
    assert "run" in tokens, "'running' should become 'run'"
    assert "study" in tokens, "'studying' should become 'study'"
    assert "book" in tokens, "'books' should become 'book'"

    print("PASSED: Lemmatization working correctly\n")


def test_ngram_generation():
    """Test n-gram generation."""
    print("=" * 60)
    print("TEST 4: N-GRAM GENERATION")
    print("=" * 60)

    tokens = ["the", "quick", "brown", "fox", "jumps"]

    bigrams = TextProcessor.generate_ngrams(tokens, 2)
    trigrams = TextProcessor.generate_ngrams(tokens, 3)

    print(f"Tokens:   {tokens}")
    print(f"Bigrams:  {bigrams}")
    print(f"Trigrams: {trigrams}")

    # Verify bigrams
    assert len(bigrams) == 4, f"Expected 4 bigrams, got {len(bigrams)}"
    assert "the quick" in bigrams, "'the quick' should be a bigram"
    assert "fox jumps" in bigrams, "'fox jumps' should be a bigram"

    # Verify trigrams
    assert len(trigrams) == 3, f"Expected 3 trigrams, got {len(trigrams)}"
    assert "the quick brown" in trigrams, "'the quick brown' should be a trigram"

    print("PASSED: N-grams generated correctly\n")


def test_full_preprocessing_pipeline():
    """Test the complete preprocessing pipeline used for TF-IDF."""
    print("=" * 60)
    print("TEST 5: FULL PREPROCESSING PIPELINE (preprocess_for_tfidf)")
    print("=" * 60)

    text = "The researchers are studying machine learning algorithms for natural language processing tasks."

    result = TextProcessor.preprocess_for_tfidf(text)

    print(f"Input text: '{text}'")
    print(f"\nGenerated n-grams ({len(result)} total):")
    print(f"  First 5: {result[:5]}")
    print(f"  Last 5:  {result[-5:]}")

    # Should contain both bigrams and trigrams
    assert len(result) > 0, "Should generate some n-grams"

    # Check that stopwords are not in the n-grams
    for ngram in result:
        words = ngram.split()
        for word in words:
            assert word not in TextProcessor.STOPWORDS, f"Stopword '{word}' found in n-gram '{ngram}'"

    print("PASSED: Full pipeline working correctly\n")


def test_edge_cases():
    """Test edge cases and special inputs."""
    print("=" * 60)
    print("TEST 6: EDGE CASES")
    print("=" * 60)

    # Empty string
    result = TextProcessor.clean_text("", remove_stopwords=True)
    assert result == [], "Empty string should return empty list"
    print("  Empty string: PASSED")

    # Only stopwords
    result = TextProcessor.clean_text("the a an is are", remove_stopwords=True)
    assert result == [], "Only stopwords should return empty list"
    print("  Only stopwords: PASSED")

    # Numbers and punctuation
    result = TextProcessor.clean_text("Hello, world! 123 testing...", remove_stopwords=False)
    assert "123" not in str(result), "Numbers should be removed"
    print("  Numbers/punctuation removal: PASSED")

    # Mixed case
    result = TextProcessor.clean_text("HELLO World TeSt", remove_stopwords=False)
    assert all(word.islower() for word in result), "All words should be lowercase"
    print("  Case normalization: PASSED")

    # Short text (fewer tokens than n-gram size)
    result = TextProcessor.generate_ngrams(["hello"], 3)
    assert result == [], "Should return empty list when tokens < n"
    print("  Short text n-gram: PASSED")

    print("\nAll edge cases passed!\n")


def run_all_tests():
    """Run all tests and provide summary."""
    print("\n" + "=" * 60)
    print("TEXT PROCESSING TEST SUITE")
    print("Testing: Tokenization, Stopword Removal, Lemmatization")
    print("=" * 60 + "\n")

    try:
        test_tokenization()
        test_stopword_removal()
        test_lemmatization()
        test_ngram_generation()
        test_full_preprocessing_pipeline()
        test_edge_cases()

        print("=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        print("\nYour preprocessing pipeline correctly implements:")
        print("  1. Tokenization (splitting text into words)")
        print("  2. Stopword removal (filtering common words)")
        print("  3. Lemmatization (reducing to base forms)")
        print("  4. N-gram generation (bigrams + trigrams)")

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
