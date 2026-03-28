import React, { useMemo, useState } from 'react';
import './HighlightedText.css';

/**
 * Renders text with highlighted spans based on match positions.
 *
 * Props:
 *   text: string - The full text to display
 *   highlights: Array<{start, end, similarity}> - Positions to highlight
 *   maxChars: number - Maximum characters to show initially (default 3000)
 */
function HighlightedText({ text, highlights = [], maxChars = 3000 }) {
  const [expanded, setExpanded] = useState(false);

  const segments = useMemo(() => {
    if (!text) return [];
    if (!highlights || highlights.length === 0) {
      return [{ text, highlighted: false, start: 0, end: text.length }];
    }

    // Sort highlights by start position
    const sorted = [...highlights].sort((a, b) => a.start - b.start);

    const result = [];
    let lastEnd = 0;

    for (const hl of sorted) {
      // Skip invalid highlights
      if (hl.start < 0 || hl.end > text.length || hl.start >= hl.end) {
        continue;
      }

      // Add non-highlighted text before this highlight
      if (hl.start > lastEnd) {
        result.push({
          text: text.slice(lastEnd, hl.start),
          highlighted: false,
          start: lastEnd,
          end: hl.start
        });
      }

      // Add highlighted text
      result.push({
        text: text.slice(hl.start, hl.end),
        highlighted: true,
        similarity: hl.similarity,
        start: hl.start,
        end: hl.end
      });

      lastEnd = Math.max(lastEnd, hl.end);
    }

    // Add remaining non-highlighted text
    if (lastEnd < text.length) {
      result.push({
        text: text.slice(lastEnd),
        highlighted: false,
        start: lastEnd,
        end: text.length
      });
    }

    return result;
  }, [text, highlights]);

  // Filter segments for display based on expanded state
  const visibleSegments = useMemo(() => {
    if (!text) return [];
    if (expanded || text.length <= maxChars) return segments;

    // Show only segments up to maxChars
    const result = [];
    let charCount = 0;

    for (const segment of segments) {
      if (charCount >= maxChars) break;

      const remaining = maxChars - charCount;
      if (segment.text.length <= remaining) {
        result.push(segment);
        charCount += segment.text.length;
      } else {
        // Truncate this segment
        result.push({
          ...segment,
          text: segment.text.slice(0, remaining) + '...',
          end: segment.start + remaining
        });
        charCount = maxChars;
        break;
      }
    }

    return result;
  }, [segments, expanded, maxChars, text]);

  const needsTruncation = text && text.length > maxChars;
  const highlightCount = highlights ? highlights.length : 0;

  if (!text) {
    return <div className="highlighted-text-empty">No text available</div>;
  }

  return (
    <div className="highlighted-text-container">
      {highlightCount > 0 && (
        <div className="highlighted-text-stats">
          <span className="highlight-count">{highlightCount} matching sentence{highlightCount !== 1 ? 's' : ''}</span>
        </div>
      )}
      <div className="highlighted-text">
        {visibleSegments.map((segment, idx) => (
          segment.highlighted ? (
            <mark
              key={idx}
              className="highlight"
              style={{
                backgroundColor: `rgba(239, 68, 68, ${0.15 + (segment.similarity || 0.5) * 0.55})`
              }}
              title={`${Math.round((segment.similarity || 0) * 100)}% similar`}
            >
              {segment.text}
            </mark>
          ) : (
            <span key={idx}>{segment.text}</span>
          )
        ))}
      </div>

      {needsTruncation && (
        <button
          className="expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : `Show More (${Math.round(text.length / 1000)}k chars)`}
        </button>
      )}
    </div>
  );
}

export default HighlightedText;
