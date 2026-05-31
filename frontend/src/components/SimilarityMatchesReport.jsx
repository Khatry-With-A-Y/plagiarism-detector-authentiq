import React, { useEffect, useState } from 'react';
import HighlightedText from './HighlightedText';
import {
  calculateRiskLevel,
  getRiskLabel,
  normalizeScore,
  RISK_PROFILES,
  SCORE_INPUT_SCALES,
} from '../utils/riskAssessment';
import './SimilarityMatchesReport.css';

const getHighestSentenceMatch = (result) => {
  if (!result.match_details?.matches?.length) return null;
  return Math.max(...result.match_details.matches.map(match => match.similarity || 0));
};

const getRiskProfile = (context) => {
  return context === 'review' ? RISK_PROFILES.REVIEW : RISK_PROFILES.SUBMITTER;
};

const getMatchClassification = (similarity) => {
  if (similarity >= 0.8) return { label: 'High Match', color: 'var(--ink-900)' };
  if (similarity >= 0.5) return { label: 'Medium Match', color: '#D97706' };
  return { label: 'Possible Paraphrase', color: 'var(--green-600)' };
};

const truncateText = (value, maxLength = 60) => {
  const text = `${value ?? ''}`.trim();
  if (!text) return '--';
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
};

const toAuthorList = (authorValue) => {
  if (Array.isArray(authorValue)) {
    return authorValue
      .map((author) => (typeof author === 'string' ? author : author?.name))
      .map((author) => `${author ?? ''}`.trim())
      .filter(Boolean);
  }

  if (typeof authorValue !== 'string') return [];

  const raw = authorValue.trim();
  if (!raw) return [];

  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((author) => (typeof author === 'string' ? author : author?.name))
          .map((author) => `${author ?? ''}`.trim())
          .filter(Boolean);
      }
    } catch {
      // Fallback to delimiter parsing below.
    }
  }

  return raw
    .split(/\s*(?:,|;|\band\b|&)\s*/i)
    .map((author) => author.trim())
    .filter(Boolean);
};

const getCollapsedAuthorPreview = (authorList, fallbackText) => {
  if (!authorList.length) return truncateText(fallbackText, 32);
  if (authorList.length === 1) return truncateText(authorList[0], 32);
  return `${truncateText(authorList[0], 24)} +${authorList.length - 1} more`;
};

export default function SimilarityMatchesReport({
  results = [],
  submissionText = '',
  documentsCompared,
  context = 'submitter',
}) {
  const [expandedSource, setExpandedSource] = useState(null);
  const riskOptions = {
    inputScale: SCORE_INPUT_SCALES.RATIO,
    profile: getRiskProfile(context),
    useMaxLogic: true,
  };

  useEffect(() => {
    setExpandedSource(null);
  }, [results]);

  const comparedCount = documentsCompared || results.length;

  const toggleSourceExpansion = (rowKey) => {
    setExpandedSource(prev => (prev === rowKey ? null : rowKey));
  };

  return (
    <div className="dashboard-reports">
      <div className="dashboard-reports-header">
        <h2>Similarity Matches</h2>
        <span style={{ fontSize: '14px', color: '#64748b' }}>
          {comparedCount} document{comparedCount !== 1 ? 's' : ''} compared
        </span>
      </div>

      {results.length === 0 ? (
        <div className="dashboard-empty">
          <svg
            className="dashboard-empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
          <h3>No matches found</h3>
          <p>
            {context === 'review'
              ? 'No automated similarity matches were detected in the corpus.'
              : 'Your document appears to be original!'}
          </p>
        </div>
      ) : (
        <table className="dashboard-table">
          <thead>
            <tr>
              <th style={{ width: '8%' }}>Rank</th>
              <th style={{ width: '37%' }}>Source Document</th>
              <th style={{ width: '15%' }}>Author</th>
              <th style={{ width: '15%' }}>Similarity %</th>
              <th style={{ width: '15%' }}>Risk Level</th>
              <th style={{ width: '10%' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => {
              const similarityScore = result.similarity_score || 0;
              const similarity = normalizeScore(similarityScore, SCORE_INPUT_SCALES.RATIO);
              const highestMatch = getHighestSentenceMatch(result);
              const riskLevel = calculateRiskLevel(similarityScore, highestMatch, riskOptions);
              const rowKey = result.paper_id ?? `${result.title || 'source'}-${index}`;
              const isExpanded = expandedSource === rowKey;
              const hasMatchDetails = result.match_details && result.match_details.matches && result.match_details.matches.length > 0;
              const sourceTitle = result.title || result.filename || `Source #${index + 1}`;
              const shouldShowFullMetadata = isExpanded || !hasMatchDetails;
              const authorList = toAuthorList(result.authors ?? result.author);
              const rawAuthorText = typeof result.author === 'string' ? result.author.trim() : '';
              const fullAuthorText = authorList.length ? authorList.join(', ') : (rawAuthorText || '--');
              const titleText = shouldShowFullMetadata ? sourceTitle : truncateText(sourceTitle, 64);
              const authorText = shouldShowFullMetadata
                ? fullAuthorText
                : getCollapsedAuthorPreview(authorList, fullAuthorText);

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    style={{ cursor: hasMatchDetails ? 'pointer' : 'default' }}
                    onClick={() => hasMatchDetails && toggleSourceExpansion(rowKey)}
                  >
                    <td style={{ fontWeight: '700', color: 'var(--green-600)' }}>#{index + 1}</td>
                    <td>
                      <div className="dashboard-doc-cell">
                        <div className="dashboard-doc-icon-small">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div className="dashboard-doc-info">
                          <span
                            className="dashboard-doc-name"
                            style={shouldShowFullMetadata
                              ? {
                                whiteSpace: 'normal',
                                overflow: 'visible',
                                textOverflow: 'clip',
                              }
                              : undefined}
                          >
                            {titleText}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style={shouldShowFullMetadata ? { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' } : undefined}>
                      {authorText}
                    </td>
                    <td>
                      <span className={`dashboard-similarity ${riskLevel}`}>
                        {similarity.toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span className={`dashboard-risk-badge ${riskLevel}`}>
                        {getRiskLabel(riskLevel)}
                      </span>
                    </td>
                    <td>
                      {hasMatchDetails ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSourceExpansion(rowKey);
                          }}
                          style={{
                            background: isExpanded ? '#1e40af' : '#f1f5f9',
                            color: isExpanded ? '#fff' : '#64748b',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                            }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>--</span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && hasMatchDetails && (
                    <tr className="similarity-details-row">
                      <td colSpan={6} className="similarity-details-cell">
                        <div className="similarity-details-body">
                          <div className="similarity-details-grid">
                            <section className="similarity-pane similarity-pane--document">
                              <h4 className="similarity-pane-title">
                                Your Document (Highlighted Matches)
                              </h4>
                              <HighlightedText
                                text={submissionText || ''}
                                highlights={result.match_details.submission_highlight_ranges || []}
                              />
                            </section>

                            <section className="similarity-pane similarity-pane--matches">
                              <h4 className="similarity-pane-title">
                                Matched Sentences ({result.match_details.matches.length})
                              </h4>
                              <div className="similarity-matches-list">
                                {result.match_details.matches.map((match, idx) => {
                                  const classification = getMatchClassification(match.similarity);
                                  return (
                                    <div
                                      key={`${rowKey}-match-${idx}`}
                                      style={{
                                        padding: '12px 16px',
                                        borderBottom: idx < result.match_details.matches.length - 1 ? '1px solid #f1f5f9' : 'none',
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '600', color: classification.color, textTransform: 'uppercase' }}>
                                          {classification.label}
                                        </span>
                                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                                          {Math.round(match.similarity * 100)}% similar
                                        </span>
                                      </div>
                                      <div style={{ marginBottom: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Your text:</span>
                                        <p
                                          style={{
                                            fontSize: '13px',
                                            color: '#334155',
                                            margin: 0,
                                            lineHeight: '1.5',
                                            background: '#fef2f2',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            borderLeft: '3px solid #ef4444',
                                          }}
                                        >
                                          "{match.submission_sentence?.text || ''}"
                                        </p>
                                      </div>
                                      <div>
                                        <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                                          Source ({sourceTitle}):
                                        </span>
                                        <p
                                          style={{
                                            fontSize: '13px',
                                            color: '#334155',
                                            margin: 0,
                                            lineHeight: '1.5',
                                            background: '#f0f9ff',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            borderLeft: '3px solid #3b82f6',
                                          }}
                                        >
                                          "{match.corpus_sentence?.text || ''}"
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
