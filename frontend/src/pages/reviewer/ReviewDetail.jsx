import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import '../dashboard.css';

const FAIL_REASON_LABELS = {
  suspected_paraphrase:  'Suspected paraphrasing of existing corpus',
  insufficient_citation: 'Insufficient citation',
  low_content_quality:   'Content quality below threshold',
  out_of_scope:          'Out of CS scope',
  other:                 'Other (see comment)',
};

const FAIL_REASON_TAXONOMY = Object.keys(FAIL_REASON_LABELS);

export default function ReviewDetail() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Block 7: defense-in-depth — opening from the Completed tab also forces
  // read-only, in addition to the explicit `?readonly=1` flag. The server's
  // `MUST_ACCEPT_FIRST` guard remains the authoritative safety net.
  const isReadOnly = searchParams.get('readonly') === '1'
    || searchParams.get('tab') === 'completed';

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Voting state
  const [selectedVote, setSelectedVote] = useState(null);
  const [comment, setComment] = useState('');
  const [failReasons, setFailReasons] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // Block 5: lifecycle (accept / decline) state
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState(null);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const reloadAssignment = () =>
    reviewsAPI.getAssignment(Number(submissionId)).then(res => setAssignment(res.data));

  useEffect(() => {
    reviewsAPI.getAssignment(Number(submissionId))
      .then(res => setAssignment(res.data))
      .catch(err => {
        if (err.response?.status === 403) {
          setError('You do not have an assignment for this submission.');
        } else {
          setError('Failed to load assignment details.');
        }
      })
      .finally(() => setLoading(false));
  }, [submissionId]);

  const handleAccept = async () => {
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await reviewsAPI.acceptAssignment(Number(submissionId));
      await reloadAssignment();
    } catch (err) {
      setLifecycleError(err.response?.data?.error || 'Failed to accept assignment.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleDecline = async () => {
    if (declineReason.length > 500) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await reviewsAPI.declineAssignment(Number(submissionId), declineReason.trim() || null);
      // After declining, the reviewer no longer has access; bounce back.
      navigate('/reviewer');
    } catch (err) {
      setLifecycleError(err.response?.data?.error || 'Failed to decline assignment.');
      setLifecycleBusy(false);
    }
  };

  const toggleFailReason = (reason) => {
    setFailReasons(prev =>
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  };

  const canSubmit = () => {
    if (!selectedVote) return false;
    if (selectedVote === 'fail') {
      if (comment.trim().length < 20) return false;
      if (failReasons.length === 0) return false;
    }
    return true;
  };

  const handleSubmitVote = async () => {
    if (!canSubmit()) return;
    setSubmitting(true);
    setVoteError(null);
    try {
      await reviewsAPI.submitVote(
        Number(submissionId),
        selectedVote,
        comment.trim(),
        selectedVote === 'fail' ? failReasons : null
      );
      setVoteSuccess(true);
      // Refresh assignment data
      const res = await reviewsAPI.getAssignment(Number(submissionId));
      setAssignment(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit vote. Please try again.';
      setVoteError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="dashboard-container">
      <div className="dashboard-loading">Loading assignment…</div>
    </div>
  );

  if (error) return (
    <div className="dashboard-container">
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</p>
        <button className="dashboard-view-link" onClick={() => navigate('/reviewer')}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  const status = assignment?.assignment_status;
  const alreadyVoted = status === 'voted' || voteSuccess;
  const isAccepted   = status === 'accepted';
  const isAssigned   = status === 'assigned';
  const isInactive   = status === 'declined' || status === 'expired';
  // Voting UI is only available once the reviewer has explicitly accepted.
  const showVoting = !isReadOnly && !alreadyVoted && isAccepted;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            className="dashboard-view-link"
            style={{ marginBottom: '8px', fontSize: '13px' }}
            onClick={() => navigate('/reviewer')}
          >
            ← Back to Dashboard
          </button>
          <h1 className="dashboard-title">
            {isReadOnly ? 'Submitted Review' : 'Review Assignment'}
          </h1>
          <p className="dashboard-subtitle">
            {assignment?.filename || `Submission #${submissionId}`}
            <span className="dashboard-risk-badge pending" style={{ marginLeft: '10px', fontSize: '11px' }}>
              {assignment?.domain_tag || 'CS'}
            </span>
          </p>
        </div>
      </div>

      {/* Submission text */}
      <div className="dashboard-card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
          Submission Content
        </h3>
        {assignment?.submission_text ? (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            maxHeight: '320px',
            overflowY: 'auto',
            fontSize: '13px',
            lineHeight: '1.7',
            color: '#374151',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {assignment.submission_text}
          </div>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>No content available.</p>
        )}
      </div>

      {/* Top similarity matches */}
      {assignment?.top_matches?.length > 0 && (
        <div className="dashboard-card" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            Similarity Matches (Top {assignment.top_matches.length})
          </h3>
          <table className="dashboard-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Paper</th>
                <th>Doc Score</th>
                <th>Sentence Match</th>
              </tr>
            </thead>
            <tbody>
              {assignment.top_matches.map((m, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left' }}>
                    <span style={{ fontWeight: 500 }}>{m.title || `Paper #${m.paper_id}`}</span>
                    {m.author && <span style={{ color: '#64748b', fontSize: '12px' }}> — {m.author}</span>}
                  </td>
                  <td>
                    <span className={`dashboard-risk-badge ${
                      m.similarity_score >= 0.5 ? 'high' :
                      m.similarity_score >= 0.2 ? 'medium' : 'low'
                    }`}>
                      {(m.similarity_score * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: '#374151' }}>
                      {m.highest_match ? `${(m.highest_match * 100).toFixed(1)}%` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Block 5: Inactive (declined / expired) banner */}
      {isInactive && !isReadOnly && (
        <div className="dashboard-card" style={{
          marginBottom: '20px',
          borderLeft: '4px solid #94a3b8',
          background: '#f8fafc',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
            Assignment {status === 'declined' ? 'Declined' : 'Expired'}
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            {status === 'declined'
              ? 'You declined this assignment. A replacement reviewer has been notified.'
              : 'The deadline has passed and this assignment expired. A replacement reviewer has been notified.'}
            {assignment?.decline_reason && (
              <> Reason: <em>{assignment.decline_reason}</em></>
            )}
          </p>
        </div>
      )}

      {/* Block 5: Accept / Decline panel — shown only when status='assigned' */}
      {isAssigned && !isReadOnly && (
        <div className="dashboard-card" style={{
          marginBottom: '20px',
          borderLeft: '4px solid #1e40af',
          background: '#eff6ff',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
            Accept this review assignment
          </h3>
          <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
            You have until <strong>{assignment?.deadline_at ? new Date(assignment.deadline_at).toLocaleString() : '—'}</strong> to
            cast your vote. Please accept the assignment to unlock the voting
            panel below, or decline if you cannot review this submission.
          </p>

          {!showDecline ? (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handleAccept}
                disabled={lifecycleBusy}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: lifecycleBusy ? '#94a3b8' : '#10b981',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {lifecycleBusy ? 'Accepting…' : '✓ Accept Assignment'}
              </button>
              <button
                onClick={() => setShowDecline(true)}
                disabled={lifecycleBusy}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#dc2626',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                }}
              >
                Decline
              </button>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                Reason for declining (optional, max 500 characters)
              </label>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g., Conflict of interest with the topic; will be unavailable this week…"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                  marginBottom: '4px',
                }}
              />
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                {declineReason.length}/500
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleDecline}
                  disabled={lifecycleBusy}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: lifecycleBusy ? '#94a3b8' : '#dc2626',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {lifecycleBusy ? 'Declining…' : 'Confirm Decline'}
                </button>
                <button
                  onClick={() => { setShowDecline(false); setDeclineReason(''); }}
                  disabled={lifecycleBusy}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {lifecycleError && (
            <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{lifecycleError}</p>
          )}
        </div>
      )}

      {/* Already voted — show submitted review */}
      {alreadyVoted && (
        <div className="dashboard-card" style={{ marginBottom: '20px', borderLeft: '4px solid #10b981' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            Your Submitted Review
          </h3>
          <p style={{ marginBottom: '8px' }}>
            <strong>Vote:</strong>{' '}
            <span className={`dashboard-risk-badge ${assignment?.vote === 'pass' ? 'low' : 'high'}`}>
              {assignment?.vote?.toUpperCase() || (voteSuccess ? selectedVote?.toUpperCase() : '—')}
            </span>
          </p>
          {assignment?.comment && (
            <p style={{ marginBottom: '8px', fontSize: '14px', color: '#374151' }}>
              <strong>Comment:</strong> {assignment.comment}
            </p>
          )}
          {assignment?.fail_reasons?.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <strong style={{ fontSize: '13px' }}>Reasons:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {assignment.fail_reasons.map(r => (
                  <span key={r} className="dashboard-risk-badge high" style={{ fontSize: '11px' }}>
                    {FAIL_REASON_LABELS[r] || r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {voteSuccess && (
            <p style={{ marginTop: '12px', color: '#10b981', fontSize: '13px', fontWeight: 500 }}>
              ✓ Vote submitted successfully. Thank you for your review!
            </p>
          )}
        </div>
      )}

      {/* Voting panel — only shown when active and not read-only */}
      {showVoting && (
        <div className="dashboard-card">
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            Cast Your Vote
          </h3>

          {/* Pass / Fail buttons */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <button
              onClick={() => { setSelectedVote('pass'); setFailReasons([]); }}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                border: `2px solid ${selectedVote === 'pass' ? '#10b981' : '#e5e7eb'}`,
                background: selectedVote === 'pass' ? '#f0fdf4' : '#fff',
                color: selectedVote === 'pass' ? '#065f46' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.15s',
              }}
            >
              ✓ Pass
            </button>
            <button
              onClick={() => setSelectedVote('fail')}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                border: `2px solid ${selectedVote === 'fail' ? '#ef4444' : '#e5e7eb'}`,
                background: selectedVote === 'fail' ? '#fef2f2' : '#fff',
                color: selectedVote === 'fail' ? '#991b1b' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.15s',
              }}
            >
              ✗ Fail
            </button>
          </div>

          {/* Fail reasons checklist — only shown when Fail selected */}
          {selectedVote === 'fail' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>
                Reason(s) for failing <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {FAIL_REASON_TAXONOMY.map(reason => (
                  <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={failReasons.includes(reason)}
                      onChange={() => toggleFailReason(reason)}
                      style={{ width: '15px', height: '15px', accentColor: '#1e40af' }}
                    />
                    {FAIL_REASON_LABELS[reason]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Comment box */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
              Comment{selectedVote === 'fail' ? <span style={{ color: '#ef4444' }}> * (min 20 chars)</span> : ' (optional)'}
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={
                selectedVote === 'fail'
                  ? 'Explain why this submission fails originality review (required, min 20 characters)…'
                  : 'Optional comments for the admin…'
              }
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${selectedVote === 'fail' && comment.trim().length < 20 && comment.length > 0 ? '#ef4444' : '#e5e7eb'}`,
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              {selectedVote === 'fail' && comment.trim().length < 20 && comment.length > 0 && (
                <span style={{ fontSize: '11px', color: '#ef4444' }}>
                  {20 - comment.trim().length} more characters required
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                {comment.length}/1000
              </span>
            </div>
          </div>

          {/* Validation hint */}
          {selectedVote === 'fail' && failReasons.length === 0 && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
              Please select at least one reason for failing.
            </p>
          )}

          {voteError && (
            <p style={{ fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{voteError}</p>
          )}

          <button
            onClick={handleSubmitVote}
            disabled={!canSubmit() || submitting}
            style={{
              padding: '10px 32px',
              borderRadius: '8px',
              border: 'none',
              background: canSubmit() ? '#1e40af' : '#e5e7eb',
              color: canSubmit() ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '14px',
              cursor: canSubmit() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit Vote'}
          </button>
        </div>
      )}
    </div>
  );
}
