"""
Thread-safe corpus and IDF cache for plagiarism detection.

This module provides a singleton cache that:
1. Loads corpus preprocessed n-grams once, shared by all worker threads
2. Computes IDF once when corpus changes, reused for all submissions
3. Automatically invalidates when corpus is modified (paper add/delete)

This eliminates redundant work when processing multiple submissions concurrently.
"""

import math
import threading
import time
from collections import Counter
from typing import Dict, List, Optional, Tuple


class CorpusCache:
    """
    Thread-safe singleton cache for corpus preprocessed n-grams and IDF values.
    Eliminates redundant DB queries and IDF computations across concurrent submissions.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._data_lock = threading.RLock()  # Reentrant for nested calls
        self._corpus: Optional[List[Tuple[int, List[str]]]] = None
        self._corpus_dict: Optional[Dict[int, List[str]]] = None  # paper_id -> ngrams
        self._last_refresh: float = 0
        self._ttl: float = 60.0  # 60 second TTL
        self._corpus_version: int = 0  # Incremented on invalidation
        # IDF cache
        self._idf_cache: Optional[Dict[str, float]] = None
        self._idf_version: int = -1  # Track which corpus version IDF was computed for
        self._initialized = True

    def get_corpus(self) -> List[Tuple[int, List[str]]]:
        """
        Get cached corpus, refreshing if stale.
        Thread-safe: multiple readers can access cached data simultaneously.
        """
        current_time = time.time()

        # Fast path: cache is valid
        if self._corpus is not None and (current_time - self._last_refresh) < self._ttl:
            return self._corpus

        # Slow path: need to refresh
        with self._data_lock:
            # Double-check after acquiring lock (another thread may have refreshed)
            if self._corpus is not None and (current_time - self._last_refresh) < self._ttl:
                return self._corpus

            # Refresh from database
            self._refresh_corpus()
            return self._corpus

    def get_corpus_dict(self) -> Dict[int, List[str]]:
        """Get corpus as dict for O(1) paper lookup."""
        self.get_corpus()  # Ensure cache is fresh
        return self._corpus_dict

    def _refresh_corpus(self):
        """Internal: load corpus from database. Must hold _data_lock."""
        from ..models.models import Paper

        # Load preprocessed data
        corpus_data = Paper.get_all_preprocessed()

        self._corpus = corpus_data
        self._corpus_dict = {paper_id: ngrams for paper_id, ngrams in corpus_data}
        self._last_refresh = time.time()
        self._corpus_version += 1

    def get_idf(self) -> Dict[str, float]:
        """
        Get cached IDF values, recomputing only if corpus changed.
        IDF = log(N / (1 + df)) for each term across all corpus documents.
        """
        # Ensure corpus is loaded
        corpus = self.get_corpus()

        # Check if IDF is still valid
        if self._idf_cache is not None and self._idf_version == self._corpus_version:
            return self._idf_cache

        with self._data_lock:
            # Double-check after lock
            if self._idf_cache is not None and self._idf_version == self._corpus_version:
                return self._idf_cache

            self._compute_idf(corpus)
            return self._idf_cache

    def _compute_idf(self, corpus: List[Tuple[int, List[str]]]):
        """Internal: compute IDF from corpus. Must hold _data_lock."""
        if not corpus:
            self._idf_cache = {}
            self._idf_version = self._corpus_version
            return

        N = len(corpus)
        df = Counter()

        for paper_id, ngrams in corpus:
            df.update(set(ngrams))  # Document frequency

        self._idf_cache = {
            term: math.log(N / (1 + count))
            for term, count in df.items()
        }
        self._idf_version = self._corpus_version

    def invalidate(self):
        """
        Force cache refresh on next access.
        Call this when corpus changes (paper add/delete).
        """
        with self._data_lock:
            self._last_refresh = 0
            self._corpus_version += 1
            # IDF will be recomputed on next get_idf() call due to version mismatch

    def get_version(self) -> int:
        """Get current cache version for debugging."""
        return self._corpus_version

    def get_stats(self) -> dict:
        """Get cache statistics for debugging."""
        return {
            'corpus_size': len(self._corpus) if self._corpus else 0,
            'idf_terms': len(self._idf_cache) if self._idf_cache else 0,
            'corpus_version': self._corpus_version,
            'idf_version': self._idf_version,
            'ttl': self._ttl,
            'age_seconds': time.time() - self._last_refresh if self._last_refresh > 0 else None
        }


# Module-level singleton accessor
_corpus_cache: Optional[CorpusCache] = None


def get_corpus_cache() -> CorpusCache:
    """Get the global corpus cache singleton."""
    global _corpus_cache
    if _corpus_cache is None:
        _corpus_cache = CorpusCache()
    return _corpus_cache
