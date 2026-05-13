import React, { useEffect, useState } from 'react';
import HighlightedText from './HighlightedText';
import {
  calculateRiskLevel,
  getRiskLabel,
  normalizeScore,
  RISK_PROFILES,
  SCORE_INPUT_SCALES,
} from '../utils/riskAssessment';

const getHighestSentenceMatch = (result) => {
  if (!result.match_details?.matches?.length) return null;
  return Math.max(...result.match_details.matches.map(match => match.similarity || 0));
};

const getRiskProfile = (context) => {
  return context === 'review' ? RISK_PROFILES.REVIEW : RISK_PROFILES.SUBMITTER;
};

const getMatchClassification = (similarity) => {
  if (similarity >= 0.8) return { label: 'High Match', color: '#dc2626' };
  if (similarity >= 0.5) return { label: 'Medium Match', color: '#f59e0b' };
  return { label: 'Possible Paraphrase', color: '#3b82f6' };
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

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    style={{ cursor: hasMatchDetails ? 'pointer' : 'default' }}
                    onClick={() => hasMatchDetails && toggleSourceExpansion(rowKey)}
                  >
                    <td style={{ fontWeight: '600', color: '#1e40af' }}>#{index + 1}</td>
                    <td>
                      <div className="dashboard-doc-cell">
                        <div className="dashboard-doc-icon-small">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div className="dashboard-doc-info">
                          <span className="dashboard-doc-name">{sourceTitle}</span>
                          {result.filename && (
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{result.filename}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{result.author || '--'}</td>
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
                    <tr>
                      <td colSpan="6" style={{ padding: 0, background: '#f8fafc' }}>
                        <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div>
                              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '12px' }}>
                                Your Document (Highlighted Matches)
                              </h4>
                              <HighlightedText
                                text={submissionText || ''}
                                highlights={result.match_details.submission_highlight_ranges || []}
                              />
                            </div>

                            <div>
                              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '12px' }}>
                                Matched Sentences ({result.match_details.matches.length})
                              </h4>
                              <div
                                style={{
                                  maxHeight: '400px',
                                  overflowY: 'auto',
                                  background: '#fff',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                }}
                              >
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
                            </div>
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
