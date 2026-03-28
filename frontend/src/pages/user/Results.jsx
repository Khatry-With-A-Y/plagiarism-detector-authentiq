import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useFetchResults from '../../hooks/useFetchResults';
import HighlightedText from '../../components/HighlightedText';
import { calculateRiskLevel, getRiskLabel } from '../../utils/riskAssessment';
import '../dashboard.css';

function Results({ id: propId, isEmbedded }) {
  const { id: paramId } = useParams();
  const id = propId || paramId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { results, submission, loading, error, refresh } = useFetchResults(id);
  const [expandedSource, setExpandedSource] = useState(null);

  const getUserInitials = () => {
    if (!user?.username) return 'U';
    return user.username.charAt(0).toUpperCase();
  };

  // Helper function to extract highest sentence match from match_details
  const getHighestSentenceMatch = (result) => {
    if (!result.match_details?.matches?.length) return 0;
    return Math.max(...result.match_details.matches.map(match => match.similarity * 100));
  };

  // Calculate overall similarity using max logic (similarity + sentence matches)
  const overallHighestMatch = results.length > 0
    ? Math.max(...results.map(r => getHighestSentenceMatch(r)))
    : 0;

  const maxSimilarity = results.length > 0
    ? Math.max(...results.map(r => r.similarity_score * 100))
    : 0;

  const overallRisk = calculateRiskLevel(maxSimilarity, overallHighestMatch, true);

  const getSummaryStyle = (risk) => {
    switch(risk) {
      case 'critical':
      case 'high':
        return { bg: '#fee2e2', color: '#dc2626', icon: 'alert' };
      case 'medium':
        return { bg: '#fef3c7', color: '#d97706', icon: 'warning' };
      default:
        return { bg: '#dcfce7', color: '#16a34a', icon: 'success' };
    }
  };
  const summaryStyle = getSummaryStyle(overallRisk);

  const toggleSourceExpansion = (paperId) => {
    setExpandedSource(expandedSource === paperId ? null : paperId);
  };

  const getMatchClassification = (similarity) => {
    if (similarity >= 0.8) return { label: 'High Match', color: '#dc2626' };
    if (similarity >= 0.5) return { label: 'Medium Match', color: '#f59e0b' };
    return { label: 'Possible Paraphrase', color: '#3b82f6' };
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner"></div>
        <p>Loading results...</p>
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "" : "dashboard"}>
      {/* Navbar - hide if embedded */}
      {!isEmbedded && (
      <nav className="dashboard-navbar">
        <div className="dashboard-navbar-left">
          <Link to="/dashboard" className="dashboard-logo">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#1e40af"/>
              <path d="M20 8l12 6v12l-12 6-12-6V14l12-6z" fill="#3b82f6"/>
              <path d="M16 20l3 3 6-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="dashboard-logo-text">Authentiq</span>
          </Link>
          <div className="dashboard-nav-links">
            <button className="dashboard-nav-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button className="dashboard-nav-link active">Report Details</button>
          </div>
        </div>
        <div className="dashboard-navbar-right">
          <div className="dashboard-avatar">
            {getUserInitials()}
          </div>
        </div>
      </nav>
      )}

      {/* Main Content */}
      <main className={isEmbedded ? "" : "dashboard-main"} style={isEmbedded ? { padding: 0 } : {}}>
        {/* Back Button - hide if embedded */}
        {!isEmbedded && (
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '24px'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Dashboard
        </button>
        )}

        {error ? (
          <div className="dashboard-reports" style={{ textAlign: 'center', padding: '48px' }}>
            <p style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</p>
            <button className="dashboard-btn-primary" onClick={refresh}>Try Again</button>
          </div>
        ) : !submission ? (
          <div className="dashboard-reports" style={{ textAlign: 'center', padding: '48px' }}>
            <p style={{ color: '#64748b', marginBottom: '16px' }}>Submission not found</p>
            <button className="dashboard-btn-primary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            {/* Document Info Header */}
            <div className="dashboard-reports" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                    <div className="dashboard-doc-icon" style={{ width: '48px', height: '48px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div>
                      <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e', marginBottom: '4px' }}>
                        {submission.filename}
                      </h1>
                      <p style={{ fontSize: '14px', color: '#64748b' }}>
                        Status: <span style={{ color: submission.status === 'completed' ? '#16a34a' : '#f59e0b' }}>
                          {submission.status}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '32px', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Overall Similarity</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e' }}>
                      {maxSimilarity.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Highest Sentence Match</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e' }}>
                      {overallHighestMatch.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`dashboard-risk-badge ${calculateRiskLevel(maxSimilarity, overallHighestMatch, true)}`} style={{ padding: '8px 16px', fontSize: '14px' }}>
                      {getRiskLabel(calculateRiskLevel(maxSimilarity, overallHighestMatch, true))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis Summary */}
            <div className="dashboard-tip-card" style={{ marginBottom: '24px', marginLeft: '24px', marginRight: '24px', borderLeft: `4px solid ${summaryStyle.color}` }}>
              <div className="dashboard-tip-header">
                <div className="dashboard-tip-icon" style={{ backgroundColor: summaryStyle.bg, color: summaryStyle.color, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                  {summaryStyle.icon === 'success' ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  ) : summaryStyle.icon === 'warning' ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  )}
                </div>
                <h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '18px' }}>Analysis Summary</h3>
              </div>
              <div className="dashboard-tip-content" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {results.length === 0 ? (
                  <div style={{ color: '#1e293b' }}>
                    No similarity matches were found in our database. Your document appears to be completely original!
                  </div>
                ) : (
                  <>
                    <div>
                      <strong style={{ color: '#1e293b' }}>Findings:</strong> This document has an overall similarity of <strong>{maxSimilarity.toFixed(1)}%</strong> across <strong>{submission.documents_compared || results.length}</strong> sources. The highest exact sentence match detected is <strong>{overallHighestMatch.toFixed(1)}%</strong>.
                    </div>
                    <div>
                      <strong style={{ color: '#1e293b' }}>Recommendation:</strong> {overallRisk === 'low'
                        ? "Your document shows minimal similarity with sources in our database. This indicates strong originality."
                        : overallRisk === 'medium'
                        ? "Your document has some similarity with existing sources. Review the matched sections and ensure proper citations are in place."
                        : "Some sections of your document closely match existing sources. Please review the highlighted parts and add proper citations or rewrite them in your own words."}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Results Table */}
            <div className="dashboard-reports">
              <div className="dashboard-reports-header">
                <h2>Similarity Matches</h2>
                <span style={{ fontSize: '14px', color: '#64748b' }}>
                  {submission.documents_compared || results.length} document{(submission.documents_compared || results.length) !== 1 ? 's' : ''} compared
                </span>
              </div>

              {results.length === 0 ? (
                <div className="dashboard-empty">
                  <svg className="dashboard-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                  <h3>No matches found</h3>
                  <p>Your document appears to be original!</p>
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
                      const similarity = result.similarity_score * 100;
                      const highestMatch = getHighestSentenceMatch(result);
                      const riskLevel = calculateRiskLevel(similarity, highestMatch, true);
                      const isExpanded = expandedSource === result.paper_id;
                      const hasMatchDetails = result.match_details && result.match_details.matches && result.match_details.matches.length > 0;

                      return (
                        <React.Fragment key={result.paper_id}>
                          <tr
                            style={{ cursor: hasMatchDetails ? 'pointer' : 'default' }}
                            onClick={() => hasMatchDetails && toggleSourceExpansion(result.paper_id)}
                          >
                            <td style={{ fontWeight: '600', color: '#1e40af' }}>#{index + 1}</td>
                            <td>
                              <div className="dashboard-doc-cell">
                                <div className="dashboard-doc-icon-small">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                </div>
                                <div className="dashboard-doc-info">
                                  <span className="dashboard-doc-name">{result.title}</span>
                                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{result.filename}</span>
                                </div>
                              </div>
                            </td>
                            <td>{result.author}</td>
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
                                  onClick={(e) => { e.stopPropagation(); toggleSourceExpansion(result.paper_id); }}
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
                                    gap: '4px'
                                  }}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                  >
                                    <polyline points="6 9 12 15 18 9"/>
                                  </svg>
                                  {isExpanded ? 'Hide' : 'View'}
                                </button>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>--</span>
                              )}
                            </td>
                          </tr>

                          {/* Expandable Detail Panel */}
                          {isExpanded && hasMatchDetails && (
                            <tr>
                              <td colSpan="6" style={{ padding: 0, background: '#f8fafc' }}>
                                <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    {/* Left: Highlighted document text */}
                                    <div>
                                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '12px' }}>
                                        Your Document (Highlighted Matches)
                                      </h4>
                                      <HighlightedText
                                        text={submission?.submission_text || ''}
                                        highlights={result.match_details.submission_highlight_ranges || []}
                                      />
                                    </div>

                                    {/* Right: Matched sentences list */}
                                    <div>
                                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '12px' }}>
                                        Matched Sentences ({result.match_details.matches.length})
                                      </h4>
                                      <div style={{ maxHeight: '400px', overflowY: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        {result.match_details.matches.map((match, idx) => {
                                          const classification = getMatchClassification(match.similarity);
                                          return (
                                            <div
                                              key={idx}
                                              style={{
                                                padding: '12px 16px',
                                                borderBottom: idx < result.match_details.matches.length - 1 ? '1px solid #f1f5f9' : 'none'
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
                                                <p style={{ fontSize: '13px', color: '#334155', margin: 0, lineHeight: '1.5', background: '#fef2f2', padding: '8px', borderRadius: '4px', borderLeft: '3px solid #ef4444' }}>
                                                  "{match.submission_sentence?.text || ''}"
                                                </p>
                                              </div>
                                              <div>
                                                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Source ({result.title}):</span>
                                                <p style={{ fontSize: '13px', color: '#334155', margin: 0, lineHeight: '1.5', background: '#f0f9ff', padding: '8px', borderRadius: '4px', borderLeft: '3px solid #3b82f6' }}>
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

          </>
        )}
      </main>
    </div>
  );
}

export default Results;
