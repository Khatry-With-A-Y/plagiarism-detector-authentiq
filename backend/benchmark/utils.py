import math
from pathlib import Path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    sorted_intervals = sorted(intervals, key=lambda i: (i[0], i[1]))
    merged = [sorted_intervals[0]]
    for start, end in sorted_intervals[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def total_interval_length(intervals: list[tuple[int, int]]) -> int:
    return sum(max(0, end - start) for start, end in intervals)


def overlap_length(a_intervals: list[tuple[int, int]], b_intervals: list[tuple[int, int]]) -> int:
    if not a_intervals or not b_intervals:
        return 0

    i = 0
    j = 0
    overlap = 0
    a = merge_intervals(a_intervals)
    b = merge_intervals(b_intervals)

    while i < len(a) and j < len(b):
        a_start, a_end = a[i]
        b_start, b_end = b[j]
        start = max(a_start, b_start)
        end = min(a_end, b_end)
        if end > start:
            overlap += end - start
        if a_end < b_end:
            i += 1
        else:
            j += 1
    return overlap


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, int(math.ceil((p / 100.0) * len(ordered)) - 1)))
    return ordered[rank]

