import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useFetchResults from '../../hooks/useFetchResults';
import reviewsAPI from '../../api/reviews';
import Avatar from '../../components/Avatar';
import Logo from '../../components/Logo';
import SimilarityMatchesReport from '../../components/SimilarityMatchesReport';
import {
  calculateRiskLevel,
  getRiskLabel,
  normalizeScore,
  RISK_PROFILES,
  SCORE_INPUT_SCALES,
} from '../../utils/riskAssessment';
import '../dashboard.css';

function Results({ id: propId, isEmbedded }) {
  const { id: paramId } = useParams();
  const id = propId || paramId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { results, submission, loading, error, refresh } = useFetchResults(id);
  const [isEligible, setIsEligible] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Block 7 (Stage 7b): submitter post-decision panel — pseudonymous
  // (`Reviewer 1..N` labels). Identity stays admin-only.
  const [panelData, setPanelData] = useState(null);

  useEffect(() => {
    if (!submission) return;
    if (submission.status !== 'completed') {
      setEligibilityLoading(false);
      return;
    }
    // If review already requested, no need to check eligibility
    if (submission.review_status) {
      setEligibilityLoading(false);
      return;
    }
    let cancelled = false;
    const fetchEligibility = async () => {
      try {
        const response = await reviewsAPI.checkEligibility(id);
        if (!cancelled) setIsEligible(response.data.eligible === true);
      } catch (err) {
        console.error('Eligibility check failed:', err.response?.status, err.response?.data || err.message);
        if (!cancelled) setIsEligible(false);
      } finally {
        if (!cancelled) setEligibilityLoading(false);
      }
    };
    fetchEligibility();
    return () => { cancelled = true; };
  }, [id, submission?.id, submission?.status, submission?.review_status]);

  // Block 7: pull pseudonymous panel feedback once a review has been
  // requested. Refreshes whenever review_status / admin_decision changes.
  useEffect(() => {
    if (!submission?.review_status) {
      setPanelData(null);
      return;
    }
    let cancelled = false;
    reviewsAPI.getSubmissionPanel(id)
      .then(res => { if (!cancelled) setPanelData(res.data); })
      .catch(() => { if (!cancelled) setPanelData(null); });
    return () => { cancelled = true; };
  }, [id, submission?.review_status, submission?.admin_decision]);

  const handleRequestReview = async () => {
    setRequestLoading(true);
    setRequestError(null);
    try {
      await reviewsAPI.requestReview(id, 'CS');
      setRequestSuccess(true);
      setShowConfirmModal(false);
      if (refresh) refresh();
    } catch (err) {
      setRequestError(err.response?.data?.error || "Failed to request review");
    } finally {
      setRequestLoading(false);
    }
  };

  const handleOpenConfirmModal = () => {
    setRequestError(null);
    setShowConfirmModal(true);
  };

  const handleCancelConfirm = () => {
    if (requestLoading) return;
    setShowConfirmModal(false);
  };

  const submitterRiskOptions = {
    inputScale: SCORE_INPUT_SCALES.RATIO,
    profile: RISK_PROFILES.SUBMITTER,
    useMaxLogic: true,
  };

  // Helper function to extract highest sentence match from match_details
  const getHighestSentenceMatch = (result) => {
    if (!result.match_details?.matches?.length) return null;
    return Math.max(...result.match_details.matches.map(match => match.similarity || 0));
  };

  // Calculate overall similarity using max logic (similarity + sentence matches)
  const sentenceScores = results
    .map(result => getHighestSentenceMatch(result))
    .filter(score => score != null);
  const overallHighestMatch = sentenceScores.length > 0
    ? Math.max(...sentenceScores)
    : null;

  const maxSimilarity = results.length > 0
    ? Math.max(...results.map(r => r.similarity_score || 0))
    : 0;

  const maxSimilarityPercent = normalizeScore(maxSimilarity, SCORE_INPUT_SCALES.RATIO);
  const overallHighestMatchPercent = normalizeScore(overallHighestMatch ?? 0, SCORE_INPUT_SCALES.RATIO);

  const overallRisk = calculateRiskLevel(maxSimilarity, overallHighestMatch, submitterRiskOptions);

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
  const reportDetailHeadingStyle = {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#1e293b',
    fontFamily: 'Inter, var(--font-body), sans-serif',
    lineHeight: '1.2',
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
          <Logo to="/dashboard" className="dashboard-logo" />
          <div className="dashboard-nav-links">
            <button className="dashboard-nav-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button className="dashboard-nav-link active">Report Details</button>
          </div>
        </div>
        <div className="dashboard-navbar-right">
          <Avatar
            name={user?.username || 'User'}
            src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:5000${user.avatar_url}`) : undefined}
            className="dashboard-avatar"
            background={user?.role === 'admin' ? '#C53030' : user?.role === 'reviewer' ? '#1E90FF' : '#6b7280'}
            alt={`${user?.username || 'User'} avatar`}
          />
        </div>
      </nav>
      )}

      {/* Main Content */}
      <main style={isEmbedded ? { flex: 1, width: '100%', boxSizing: 'border-box', padding: '24px 2rem' } : { flex: 1, maxWidth: '1200px', margin: '0 auto', padding: '24px 2rem', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* Back Button - hide if embedded */}
        {!isEmbedded && (
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '16px'
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
            <div className="dashboard-reports" style={{ marginBottom: '16px', padding: '1.25rem' }}>
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
                      <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e', marginBottom: '4px', fontFamily: 'var(--font-body)' }}>
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
                      {maxSimilarityPercent.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Highest Sentence Match</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e' }}>
                      {overallHighestMatchPercent.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`dashboard-risk-badge ${overallRisk}`} style={{ padding: '8px 16px', fontSize: '14px' }}>
                      {getRiskLabel(overallRisk)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis Summary */}
            <div style={{
              marginBottom: '16px',
              padding: '1rem 1.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: `4px solid ${summaryStyle.color}`,
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(14, 42, 69, 0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ backgroundColor: summaryStyle.bg, color: summaryStyle.color, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>
                  {summaryStyle.icon === 'success' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  ) : summaryStyle.icon === 'warning' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  )}
                </div>
                <span style={reportDetailHeadingStyle}>Analysis Summary</span>
              </div>
              <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6' }}>
                {results.length === 0 ? (
                  <p style={{ margin: 0 }}>
                    No similarity matches were found in our database. Your document appears to be completely original!
                  </p>
                ) : (
                  <>
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#1e293b' }}>Findings:</strong> This document has an overall similarity of <strong>{maxSimilarityPercent.toFixed(1)}%</strong> across <strong>{submission.documents_compared || results.length}</strong> sources. The highest exact sentence match detected is <strong>{overallHighestMatchPercent.toFixed(1)}%</strong>.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong style={{ color: '#1e293b' }}>Recommendation:</strong> {overallRisk === 'low'
                        ? "Your document shows minimal similarity with sources in our database. This indicates strong originality."
                        : overallRisk === 'medium'
                        ? "Your document has some similarity with existing sources. Review the matched sections and ensure proper citations are in place."
                        : "Some sections of your document closely match existing sources. Please review the highlighted parts and add proper citations or rewrite them in your own words."}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Peer Review Section */}
            {submission.status === 'completed' && (
              <div className="dashboard-reports" style={{ marginBottom: '16px', padding: '1rem 1.25rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(14, 42, 69, 0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h3 style={{ ...reportDetailHeadingStyle, margin: 0 }}>Peer Review & Corpus Inclusion</h3>
                      {submission.review_status && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`dashboard-risk-badge ${
                            submission.review_status === 'approved' ? 'low' : 
                            submission.review_status === 'rejected' ? 'critical' : 'pending'
                          }`} style={{ padding: '2px 10px', fontSize: '12px' }}>
                            {submission.review_status.charAt(0).toUpperCase() + submission.review_status.slice(1).replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '13px', color: '#64748b' }}>
                            Requested on {new Date(submission.review_requested_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {!submission.review_status && (
                      eligibilityLoading ? (
                        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Checking eligibility for peer review...</p>
                      ) : isEligible ? (
                        <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '600px', margin: 0 }}>
                          This submission meets the eligibility criteria for peer review and corpus inclusion.
                        </p>
                      ) : (
                        <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
                          This submission is not eligible for peer review. Similarity score exceeds threshold.
                        </p>
                      )
                    )}
                  </div>
                  
                  {!submission.review_status && isEligible && (
                    <button 
                      className="dashboard-btn-primary" 
                      onClick={handleOpenConfirmModal}
                      disabled={requestLoading || requestSuccess}
                      style={{ padding: '8px 16px', fontSize: '14px' }}
                    >
                      {requestLoading ? "Submitting..." : requestSuccess ? "Request Submitted" : "Request Peer Review"}
                    </button>
                  )}
                </div>
                {requestError && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px' }}>{requestError}</p>
                )}
                {requestSuccess && (
                  <p style={{ color: '#16a34a', fontSize: '13px', marginTop: '8px', fontWeight: '500' }}>
                    Your request has been submitted. It will be assigned to a panel of expert reviewers shortly.
                  </p>
                )}
              </div>
            )}

            {/* Block 7 (Stage 7b): submitter post-decision panel —
                pseudonymous Reviewer 1..N labels; never exposes identity. */}
            {panelData && (panelData.admin_decision || panelData.panel?.length > 0) && (
              <div className="dashboard-reports" style={{
                marginBottom: '16px',
                padding: '1rem 1.25rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(14, 42, 69, 0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#1e293b', fontFamily: 'var(--font-body)', margin: 0 }}>
                      Reviewer Panel Feedback
                    </h3>
                    {panelData.panel && panelData.panel.length > 0 && (
                      <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                        {panelData.pass_votes} pass · {panelData.fail_votes} fail · Anonymous panel
                      </p>
                    )}
                  </div>
                  {panelData.admin_decision && (
                    <span className={`dashboard-risk-badge ${
                      panelData.admin_decision === 'approved' ? 'low' : 'critical'
                    }`} style={{ padding: '2px 10px', fontSize: '12px' }}>
                      Final Decision: {panelData.admin_decision.charAt(0).toUpperCase() + panelData.admin_decision.slice(1)}
                    </span>
                  )}
                </div>

                {panelData.admin_decision_reason && (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    marginTop: '12px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: '#334155',
                  }}>
                    <strong style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.025em', display: 'block', marginBottom: '4px' }}>Admin Remark</strong>
                    {panelData.admin_decision_reason}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  {panelData.panel && panelData.panel.length > 0 ? (
                    panelData.panel.map((p, idx) => (
                      <div key={idx} style={{
                        background: '#ffffff',
                        border: '1px solid #f1f5f9',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '16px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#475569', whiteSpace: 'nowrap', minWidth: '90px', marginTop: '2px' }}>
                            {p.label}
                          </span>
                          <p style={{ fontSize: '15px', color: '#1e293b', margin: 0, flex: 1, lineHeight: '1.5' }}>
                            {p.comment || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No comment provided.</span>}
                          </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          <span className={`dashboard-risk-badge ${p.vote === 'pass' ? 'low' : 'high'}`} style={{ fontSize: '11px', padding: '2px 8px', minWidth: '54px', justifyContent: 'center', textAlign: 'center', lineHeight: '1.2' }}>
                            {p.vote ? p.vote.toUpperCase() : '—'}
                          </span>
                          {p.fail_reasons?.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                              {[...p.fail_reasons]
                                .sort((a, b) => {
                                  if (a === 'other') return 1;
                                  if (b === 'other') return -1;

                                  const order = {
                                    insufficient_citation: 0,
                                    suspected_paraphrase: 1,
                                    low_content_quality: 2,
                                    out_of_scope: 3,
                                  };
                                  return (order[a] ?? 50) - (order[b] ?? 50);
                                })
                                .map(fr => (
                                  <span key={fr} className="dashboard-risk-badge high" style={{ fontSize: '10px', padding: '1px 6px' }}>
                                    {fr.replace(/_/g, ' ')}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                      Reviewers have not voted yet. Feedback will appear here once the panel completes.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Results Table */}
            <SimilarityMatchesReport
              results={results}
              submissionText={submission?.submission_text || ''}
              documentsCompared={submission?.documents_compared}
            />

          </>
        )}
        </div>
      </main>

      {/* Peer Review Confirmation Modal */}
      {showConfirmModal && (
        <div className="dashboard-modal-overlay">
          <div className="dashboard-modal">
            <div className="dashboard-modal-header">
              <h3>Submit for Peer Review?</h3>
              <p>Please confirm that you want to send this submission to the reviewer panel.</p>
            </div>
            <div className="dashboard-modal-body">
              <p style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: 0 }}>
                Once submitted, this report will be assigned to a panel of expert reviewers for
                double-blind evaluation. You will not be able to cancel or modify the request after this step.
                If approved, your document may be added to the verified academic corpus.
              </p>
              {requestError && (
                <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '12px' }}>{requestError}</p>
              )}
            </div>
            <div className="dashboard-modal-footer">
              <button
                type="button"
                className="dashboard-modal-btn dashboard-modal-btn-secondary"
                onClick={handleCancelConfirm}
                disabled={requestLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-modal-btn dashboard-modal-btn-primary"
                onClick={handleRequestReview}
                disabled={requestLoading}
              >
                {requestLoading ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Results;
