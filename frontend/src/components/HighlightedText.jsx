import React, { useMemo, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import './HighlightedText.css';

const normalizeText = (value = '', { inline = false } = {}) => {
  let normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ');

  if (inline) {
    normalized = normalized
      .replace(/\n+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ');
  }

  return normalized;
};

const splitParagraphsFromSegments = (segments = []) => {
  if (!segments.length) return [];

  const stream = [];
  let streamCursor = 0;

  for (const segment of segments) {
    if (!segment?.text) continue;
    stream.push({
      ...segment,
      rawText: segment.text,
      streamStart: streamCursor,
      streamEnd: streamCursor + segment.text.length,
    });
    streamCursor += segment.text.length;
  }

  if (!stream.length) return [];

  const fullRawText = stream.map((part) => part.rawText).join('');
  const paragraphRanges = [];
  const paragraphBreakRe = /\r?\n[ \t]*\r?\n+/g;
  let paragraphStart = 0;
  let match;

  while ((match = paragraphBreakRe.exec(fullRawText)) !== null) {
    paragraphRanges.push({ start: paragraphStart, end: match.index });
    paragraphStart = match.index + match[0].length;
  }
  paragraphRanges.push({ start: paragraphStart, end: fullRawText.length });

  const paragraphs = paragraphRanges
    .map((range) => {
      const tokens = [];

      for (const part of stream) {
        const overlapStart = Math.max(range.start, part.streamStart);
        const overlapEnd = Math.min(range.end, part.streamEnd);
        if (overlapEnd <= overlapStart) continue;

        const localStart = overlapStart - part.streamStart;
        const localEnd = overlapEnd - part.streamStart;
        const rawSlice = part.rawText.slice(localStart, localEnd);
        let displayText = normalizeText(rawSlice, { inline: true });

        if (!displayText.trim()) continue;

        if (tokens.length > 0) {
          const prev = tokens[tokens.length - 1];
          if (/\s$/.test(prev.text) && /^\s/.test(displayText)) {
            displayText = displayText.replace(/^\s+/, ' ');
          }
        }

        const tokenStart = part.start + localStart;
        const tokenEnd = Math.min(part.end, part.start + localEnd);

        tokens.push({
          text: displayText,
          highlighted: part.highlighted,
          similarity: part.similarity,
          start: tokenStart,
          end: tokenEnd,
        });
      }

      return tokens;
    })
    .filter((tokens) => tokens.some((token) => token.text.trim().length > 0));

  return paragraphs.length ? paragraphs : [[]];
};

const HighlightedText = forwardRef(function HighlightedText(
  { text, highlights = [], maxChars = 3000 },
  ref
) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => setExpanded(true),
      getContainer: () => containerRef.current,
    }),
    []
  );

  const segments = useMemo(() => {
    if (!text) return [];
    if (!highlights || highlights.length === 0) {
      return [{ text, highlighted: false, start: 0, end: text.length }];
    }

    const sorted = [...highlights].sort((a, b) => a.start - b.start);
    const result = [];
    let lastEnd = 0;

    for (const hl of sorted) {
      if (hl.start < 0 || hl.end > text.length || hl.start >= hl.end) {
        continue;
      }

      if (hl.start > lastEnd) {
        result.push({
          text: text.slice(lastEnd, hl.start),
          highlighted: false,
          start: lastEnd,
          end: hl.start,
        });
      }

      result.push({
        text: text.slice(hl.start, hl.end),
        highlighted: true,
        similarity: hl.similarity,
        start: hl.start,
        end: hl.end,
      });

      lastEnd = Math.max(lastEnd, hl.end);
    }

    if (lastEnd < text.length) {
      result.push({
        text: text.slice(lastEnd),
        highlighted: false,
        start: lastEnd,
        end: text.length,
      });
    }

    return result;
  }, [text, highlights]);

  const visibleSegments = useMemo(() => {
    if (!text) return [];
    if (expanded || text.length <= maxChars) return segments;

    const result = [];
    let charCount = 0;

    for (const segment of segments) {
      if (charCount >= maxChars) break;

      const remaining = maxChars - charCount;
      if (segment.text.length <= remaining) {
        result.push(segment);
        charCount += segment.text.length;
      } else {
        const slice = segment.text.slice(0, remaining);
        if (slice) {
          result.push({
            ...segment,
            text: `${slice}…`,
            end: segment.start + remaining,
          });
        }
        break;
      }
    }

    return result;
  }, [segments, expanded, maxChars, text]);

  const paragraphs = useMemo(
    () => splitParagraphsFromSegments(visibleSegments),
    [visibleSegments]
  );

  if (!text) {
    return <div className="highlighted-text-empty">No text available</div>;
  }

  const highlightCount = highlights?.length || 0;
  const needsTruncation = text.length > maxChars;

  return (
    <div className="highlighted-text-container">
      {highlightCount > 0 && (
        <div className="highlighted-text-stats">
          <span className="highlight-count">
            {highlightCount} matching sentence{highlightCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="highlighted-text" ref={containerRef}>
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p className="highlighted-paragraph" key={`p-${paragraphIndex}`}>
            {paragraph.map((token, tokenIndex) =>
              token.highlighted ? (
                <mark
                  key={`m-${paragraphIndex}-${tokenIndex}-${token.start}-${token.end}`}
                  className="highlight"
                  data-start={token.start}
                  data-end={token.end}
                  style={{
                    backgroundColor: `rgba(239, 68, 68, ${0.15 + (token.similarity || 0.5) * 0.55})`,
                  }}
                  title={`${Math.round((token.similarity || 0) * 100)}% similar`}
                >
                  {token.text}
                </mark>
              ) : (
                <span key={`s-${paragraphIndex}-${tokenIndex}-${token.start}`}>
                  {token.text}
                </span>
              )
            )}
          </p>
        ))}
      </div>

      {needsTruncation && (
        <button className="expand-btn" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? 'Show Less' : `Show More (${Math.round(text.length / 1000)}k chars)`}
        </button>
      )}
    </div>
  );
});

export default HighlightedText;
