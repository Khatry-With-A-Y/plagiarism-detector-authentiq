import React, { useState, useEffect } from 'react';
import { reviewsAPI } from '../../api/reviews';
import '../dashboard.css';

/**
 * Block 7 (Stage 7b): renders a one-glance hint explaining *why* the
 * reviewer pool was short, given the structured breakdown returned by
 * `assign_many`. Falls back to a generic message if the breakdown is
 * missing (legacy rows from before this column existed).
 */
function PoolBreakdownHint({ breakdown }) {
  if (!breakdown) {
    return (
      <span style={{ fontSize: '12px', color: '#92400e' }}>
        Insufficient reviewer pool. Onboard at least one more reviewer
        from a different institution and retry.
      </span>
    );
  }
  const {
    eligible_count = 0,
    excluded_submitter = 0,
    excluded_same_institution = 0,
    excluded_already_assigned = 0,
    excluded_expertise_mismatch = 0,
    total_active_reviewers = 0,
    min_required = 3,
  } = breakdown;

  const reasons = [];
  if (excluded_submitter)          reasons.push(`${excluded_submitter} is the submitter`);
  if (excluded_same_institution)   reasons.push(`${excluded_same_institution} same-institution conflict${excluded_same_institution === 1 ? '' : 's'}`);
  if (excluded_already_assigned)   reasons.push(`${excluded_already_assigned} already assigned (incl. declined/expired)`);
  if (excluded_expertise_mismatch) reasons.push(`${excluded_expertise_mismatch} expertise mismatch`);

  return (
    <div style={{
      fontSize: '12px',
      color: '#92400e',
      background: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: '6px',
      padding: '8px 10px',
      lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
        Only {eligible_count} eligible reviewer{eligible_count === 1 ? '' : 's'} (need ≥ {min_required}).
      </div>
      {reasons.length > 0 && (
        <div>Excluded: {reasons.join(', ')} (out of {total_active_reviewers} active reviewers).</div>
      )}
      <div style={{ marginTop: '4px', color: '#78350f' }}>
        Onboard ≥1 reviewer from a different institution and click Assign again.
      </div>
    </div>
  );
}

function ReviewQueue() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [assigning, setAssigning] = useState(null);
  const [assignMsg, setAssignMsg] = useState({});
  const [detailModal, setDetailModal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Block 6: admin Approve/Reject modal state
  const [decisionModal, setDecisionModal] = useState(null);  // { submissionId, mode: 'approve'|'reject', defaultTitle, defaultAuthor }
  const [decisionForm, setDecisionForm] = useState({ title: '', author: '', reason: '', force: false });
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const [decisionResultMsg, setDecisionResultMsg] = useState({});  // keyed by submissionId

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const response = await reviewsAPI.adminGetQueue(status, page);
      setRequests(response.data.requests);
      setTotalPages(response.data.pages);
    } catch (err) {
      setError("Failed to fetch review queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [page, status]);

  const handleAssign = async (submissionId) => {
    setAssigning(submissionId);
    setAssignMsg(prev => ({ ...prev, [submissionId]: null }));
    try {
      const res = await reviewsAPI.adminAssign(submissionId);
      const d = res.data;
      if (d.status === 'insufficient_pool') {
        // Block 7: stash the breakdown alongside the warn message so the row
        // can render PoolBreakdownHint immediately after the API call (the
        // refetch below will also bring it through `req.pool_breakdown`).
        setAssignMsg(prev => ({
          ...prev,
          [submissionId]: {
            type:      'warn',
            text:      'Insufficient reviewer pool — request marked accordingly.',
            breakdown: d.breakdown || null,
          }
        }));
      } else {
        setAssignMsg(prev => ({ ...prev, [submissionId]: { type: 'ok', text: `Assigned ${d.assigned} reviewer(s) successfully.` } }));
      }
      fetchQueue();
      // Block 7: admin just changed queue state — refresh the navbar
      // "Peer Review Queue" count immediately instead of waiting 60s.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      const msg = err.response?.data?.error || 'Assignment failed.';
      setAssignMsg(prev => ({ ...prev, [submissionId]: { type: 'err', text: msg } }));
    } finally {
      setAssigning(null);
    }
  };

  const handleViewDetail = async (submissionId) => {
    setDetailLoading(true);
    setDetailModal(null);
    try {
      const res = await reviewsAPI.adminGetSubmissionDetail(submissionId);
      setDetailModal(res.data);
    } catch {
      setDetailModal({ error: 'Failed to load details.' });
    } finally {
      setDetailLoading(false);
    }
  };

  // ---- Block 6: Approve / Reject decision flow ----
  const openDecisionModal = (mode, submission) => {
    // submission is the row from `requests` OR the loaded detail object.
    const filename = submission.filename || '';
    const baseTitle = filename.replace(/\.[^.]+$/, '');  // strip extension
    setDecisionForm({
      title:  baseTitle,
      author: '',
      reason: '',
      force:  false,
    });
    setDecisionError(null);
    setDecisionModal({
      submissionId:  submission.id || submission.submission_id,
      mode,
      filename,
      reviewStatus:  submission.review_status,
      reviewOutcome: submission.review_outcome,
    });
  };

  const closeDecisionModal = () => {
    setDecisionModal(null);
    setDecisionError(null);
    setDecisionForm({ title: '', author: '', reason: '', force: false });
  };

  const submitDecision = async () => {
    if (!decisionModal) return;
    const { submissionId, mode, reviewStatus } = decisionModal;
    const isPreQuorum = reviewStatus !== 'awaiting_admin';
    if (isPreQuorum && !decisionForm.reason.trim()) {
      setDecisionError('A reason is required when overriding a request before the panel reaches quorum.');
      return;
    }
    setDecisionSubmitting(true);
    setDecisionError(null);
    try {
      const payload = { decision: mode };
      if (decisionForm.reason.trim()) payload.reason = decisionForm.reason.trim();
      if (mode === 'approve') {
        if (decisionForm.title.trim())  payload.title  = decisionForm.title.trim();
        if (decisionForm.author.trim()) payload.author = decisionForm.author.trim();
        if (decisionForm.force)         payload.force  = true;
      }
      const res = await reviewsAPI.adminDecide(submissionId, payload);
      const r = res.data;
      const okText = mode === 'approve'
        ? `Approved — added paper #${r.paper_id} to corpus (corpus_version=${r.corpus_version}).`
        : `Rejected — submitter may now resubmit.`;
      setDecisionResultMsg(prev => ({ ...prev, [submissionId]: { type: 'ok', text: okText } }));
      closeDecisionModal();
      // If we have a detail modal open for the same submission, refresh it.
      if (detailModal && detailModal.submission_id === submissionId) {
        try {
          const detail = await reviewsAPI.adminGetSubmissionDetail(submissionId);
          setDetailModal(detail.data);
        } catch { /* ignore */ }
      }
      fetchQueue();
      // Block 7: approval/rejection just removed an item from the queue —
      // refresh the navbar "Peer Review Queue" count immediately so the
      // badge number updates without waiting for the 60s polling tick.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      const apiCode = err.response?.data?.code;
      const apiMsg  = err.response?.data?.error;
      if (apiCode === 'DUPLICATE_PAPER') {
        setDecisionError(
          `${apiMsg || 'A paper with identical content already exists in the corpus.'} ` +
          'Tick "Force" if you really intend to add a duplicate.'
        );
      } else {
        setDecisionError(apiMsg || 'Decision failed.');
      }
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
  };

  return (
    <div style={{ padding: '0 24px' }}>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Peer Review Queue</h1>
          <p className="dashboard-subtitle">Manage and assign expert reviewers to borderline submissions</p>
        </div>
      </header>

      <div className="dashboard-reports">
        <div className="dashboard-reports-header">
           <div className="dashboard-reports-actions">
              <select 
                value={status} 
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="auth-input-field"
                style={{ width: '220px', height: '40px', marginBottom: 0, fontSize: '14px' }}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending Assignment</option>
                <option value="assigned">Assigned</option>
                <option value="insufficient_pool">Insufficient Pool</option>
                <option value="awaiting_admin">Awaiting Decision</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
           </div>
        </div>

        {loading ? (
          <div className="dashboard-loading" style={{ padding: '40px 0' }}>
            <div className="dashboard-spinner"></div>
            <p>Loading queue...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p className="danger-text">{error}</p>
            <button className="dashboard-btn-primary" onClick={fetchQueue} style={{ marginTop: '16px' }}>Try Again</button>
          </div>
        ) : requests.length === 0 ? (
          <div className="dashboard-empty" style={{ padding: '60px 0' }}>
            <svg className="dashboard-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <h3>No review requests found</h3>
            <p>Requests will appear here when users submit borderline papers for inclusion.</p>
          </div>
        ) : (
          <>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Submission</th>
                  <th>Submitter</th>
                  <th>Date Requested</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id}>
                    <td>
                      <div className="dashboard-doc-cell">
                        <div className="dashboard-doc-icon-small">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                        <div className="dashboard-doc-info">
                          <span className="dashboard-doc-name" title={req.filename}>{req.filename}</span>
                          <span className="dashboard-doc-size">ID: {req.id}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>{req.submitter_name}</td>
                    <td style={{ textAlign: 'center' }}>{formatDate(req.review_requested_at)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`dashboard-risk-badge ${
                        req.review_status === 'approved' ? 'low' : 
                        req.review_status === 'rejected' ? 'critical' : 
                        req.review_status === 'awaiting_admin' ? 'medium' : 'pending'
                      }`}>
                        {req.review_status.charAt(0).toUpperCase() + req.review_status.slice(1).replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="dashboard-actions-cell" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        {req.review_status === 'pending' || req.review_status === 'insufficient_pool' ? (
                          <button
                            className="dashboard-view-link"
                            onClick={() => handleAssign(req.id)}
                            disabled={assigning === req.id}
                          >
                            {assigning === req.id ? 'Assigning…' : 'Assign Reviewers'}
                          </button>
                        ) : (
                          <button
                            className="dashboard-view-link"
                            onClick={() => handleViewDetail(req.id)}
                          >
                            View Details
                          </button>
                        )}
                        {/* Block 6: inline Approve/Reject for awaiting_admin */}
                        {req.review_status === 'awaiting_admin' && (
                          <>
                            <button
                              className="dashboard-view-link"
                              style={{ color: '#10b981' }}
                              onClick={() => openDecisionModal('approve', req)}
                            >
                              Approve
                            </button>
                            <button
                              className="dashboard-view-link"
                              style={{ color: '#dc2626' }}
                              onClick={() => openDecisionModal('reject', req)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                      {assignMsg[req.id] && (
                        <div style={{
                          fontSize: '11px', marginTop: '4px',
                          color: assignMsg[req.id].type === 'ok' ? '#10b981' :
                                 assignMsg[req.id].type === 'warn' ? '#f59e0b' : '#dc2626'
                        }}>
                          {assignMsg[req.id].text}
                        </div>
                      )}
                      {/* Block 7 (Stage 7b): persistent breakdown hint for
                          rows in insufficient_pool state OR when the latest
                          assign attempt returned a breakdown. */}
                      {(req.review_status === 'insufficient_pool'
                        || assignMsg[req.id]?.breakdown) && (
                        <div style={{ marginTop: '6px', textAlign: 'left' }}>
                          <PoolBreakdownHint
                            breakdown={assignMsg[req.id]?.breakdown
                                       || req.pool_breakdown}
                          />
                        </div>
                      )}
                      {decisionResultMsg[req.id] && (
                        <div style={{
                          fontSize: '11px', marginTop: '4px',
                          color: decisionResultMsg[req.id].type === 'ok' ? '#10b981' : '#dc2626'
                        }}>
                          {decisionResultMsg[req.id].text}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="dashboard-pagination">
                <span className="dashboard-pagination-info">Page {page} of {totalPages}</span>
                <div className="dashboard-pagination-btns">
                  <button 
                    disabled={page === 1} 
                    onClick={() => setPage(p => p - 1)}
                    className="dashboard-pagination-btn"
                  >
                    Previous
                  </button>
                  <button 
                    disabled={page === totalPages} 
                    onClick={() => setPage(p => p + 1)}
                    className="dashboard-pagination-btn"
                  >
                    Next
                  </button>
                </div>
            </div>
          </>
        )}
      </div>

      {/* Detail modal */}
      {(detailLoading || detailModal) && (
        <div className="dashboard-modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="dashboard-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '95%' }}>
            <div className="dashboard-modal-header">
              <h3 className="dashboard-modal-title">Review Details</h3>
              <button className="dashboard-modal-close" onClick={() => setDetailModal(null)}>✕</button>
            </div>
            <div className="dashboard-modal-body">
              {detailLoading ? (
                <p style={{ color: '#64748b' }}>Loading…</p>
              ) : detailModal?.error ? (
                <p style={{ color: '#dc2626' }}>{detailModal.error}</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div><strong>Status:</strong> <span className={`dashboard-risk-badge ${
                      detailModal.review_status === 'approved' ? 'low' :
                      detailModal.review_status === 'rejected' ? 'critical' :
                      detailModal.review_status === 'awaiting_admin' ? 'medium' : 'pending'
                    }`}>{detailModal.review_status}</span></div>
                    <div><strong>Outcome:</strong> {detailModal.review_outcome
                      ? <span className={`dashboard-risk-badge ${detailModal.review_outcome === 'pass' ? 'low' : 'high'}`}>{detailModal.review_outcome}</span>
                      : <span style={{ color: '#94a3b8' }}>Pending</span>}
                    </div>
                    <div><strong>Pass votes:</strong> {detailModal.pass_votes}</div>
                    <div><strong>Fail votes:</strong> {detailModal.fail_votes}</div>
                  </div>

                  {/* Block 7: insufficient_pool breakdown panel */}
                  {detailModal.review_status === 'insufficient_pool' && (
                    <div style={{ marginBottom: '16px' }}>
                      <PoolBreakdownHint breakdown={detailModal.pool_breakdown} />
                    </div>
                  )}

                  {/* Block 6: admin-decision audit panel (only when a decision has been recorded) */}
                  {detailModal.admin_decision && (
                    <div style={{
                      background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '6px',
                      padding: '10px 12px', marginBottom: '16px', fontSize: '13px'
                    }}>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Admin Decision:</strong>{' '}
                        <span className={`dashboard-risk-badge ${detailModal.admin_decision === 'approved' ? 'low' : 'critical'}`}>
                          {detailModal.admin_decision}
                        </span>
                        {detailModal.admin_decided_at && (
                          <span style={{ color: '#64748b', marginLeft: '8px' }}>
                            on {formatDate(detailModal.admin_decided_at)}
                          </span>
                        )}
                      </div>
                      {detailModal.admin_decision_reason && (
                        <div style={{ color: '#374151' }}>
                          <strong>Reason:</strong> {detailModal.admin_decision_reason}
                        </div>
                      )}
                    </div>
                  )}

                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>Reviewer Panel</h4>
                  {(!detailModal.assignments || detailModal.assignments.length === 0) ? (
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>No reviewers assigned yet.</p>
                  ) : (
                    <table className="dashboard-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>Reviewer ID</th>
                          <th>Status</th>
                          <th>Vote</th>
                          <th>Comment</th>
                          <th>Conflict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailModal.assignments.map((a, i) => {
                          const isInactive = ['declined', 'expired'].includes(a.assignment_status);
                          const statusCls =
                            a.assignment_status === 'voted'    ? 'low' :
                            a.assignment_status === 'accepted' ? 'medium' :
                            isInactive                          ? 'high' :
                                                                  'pending';
                          // Block 5: surface the decline_reason / expiry in
                          // the comment column so admins see attrition
                          // alongside active reviewer rationale.
                          const commentCell = isInactive
                            ? (a.assignment_status === 'declined'
                                ? `Declined${a.decline_reason ? ` — ${a.decline_reason}` : ''}`
                                : 'Auto-expired (deadline passed)')
                            : (a.comment || '—');
                          return (
                            <tr key={i} style={{ opacity: isInactive ? 0.55 : 1 }}>
                              <td>{a.reviewer_snapshot?.username || `#${a.reviewer_id}`}</td>
                              <td><span className={`dashboard-risk-badge ${statusCls}`}>{a.assignment_status}</span></td>
                              <td>{a.vote ? <span className={`dashboard-risk-badge ${a.vote === 'pass' ? 'low' : 'high'}`}>{a.vote}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                              <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={commentCell}>{commentCell}</td>
                              <td>{a.conflict_flag ? <span style={{ color: '#f59e0b', fontSize: '11px' }}>⚠ Yes</span> : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <div className="dashboard-modal-footer">
              {/* Block 6: Approve/Reject for awaiting_admin (and pre-quorum override) */}
              {detailModal && !detailModal.error
                && detailModal.review_status
                && !['approved', 'rejected'].includes(detailModal.review_status) && (
                <>
                  <button
                    className="dashboard-modal-btn"
                    style={{ background: '#10b981', color: '#fff', borderColor: '#10b981' }}
                    onClick={() => openDecisionModal('approve', detailModal)}
                  >
                    Approve & Promote
                  </button>
                  <button
                    className="dashboard-modal-btn"
                    style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                    onClick={() => openDecisionModal('reject', detailModal)}
                  >
                    Reject
                  </button>
                </>
              )}
              <button className="dashboard-modal-btn dashboard-modal-btn-secondary" onClick={() => setDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Block 6: Admin decision modal (Approve / Reject) */}
      {decisionModal && (
        <div className="dashboard-modal-overlay" onClick={closeDecisionModal}>
          <div className="dashboard-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '95%' }}>
            <div className="dashboard-modal-header">
              <h3 className="dashboard-modal-title">
                {decisionModal.mode === 'approve' ? 'Approve & Promote to Corpus' : 'Reject Review Request'}
              </h3>
              <button className="dashboard-modal-close" onClick={closeDecisionModal}>✕</button>
            </div>
            <div className="dashboard-modal-body">
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
                Submission #{decisionModal.submissionId}
                {decisionModal.filename && <> — <em>{decisionModal.filename}</em></>}
              </p>

              {decisionModal.reviewStatus !== 'awaiting_admin' && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px',
                  padding: '8px 10px', fontSize: '12px', color: '#92400e', marginBottom: '14px'
                }}>
                  ⚠ This request hasn’t reached panel quorum yet (status: <strong>{decisionModal.reviewStatus}</strong>).
                  A reason is required to override.
                </div>
              )}

              {decisionModal.mode === 'approve' && (
                <>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Title <span style={{ color: '#94a3b8', fontWeight: 400 }}>(defaults to filename)</span>
                  </label>
                  <input
                    type="text"
                    className="auth-input-field"
                    value={decisionForm.title}
                    onChange={e => setDecisionForm(f => ({ ...f, title: e.target.value }))}
                    style={{ width: '100%', marginBottom: '12px', height: '38px', fontSize: '13px' }}
                  />

                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Author <span style={{ color: '#94a3b8', fontWeight: 400 }}>(defaults to "Unknown")</span>
                  </label>
                  <input
                    type="text"
                    className="auth-input-field"
                    value={decisionForm.author}
                    onChange={e => setDecisionForm(f => ({ ...f, author: e.target.value }))}
                    style={{ width: '100%', marginBottom: '12px', height: '38px', fontSize: '13px' }}
                  />
                </>
              )}

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                Reason
                {decisionModal.reviewStatus !== 'awaiting_admin' && <span style={{ color: '#dc2626' }}> *</span>}
              </label>
              <textarea
                className="auth-input-field"
                value={decisionForm.reason}
                onChange={e => setDecisionForm(f => ({ ...f, reason: e.target.value }))}
                placeholder={decisionModal.mode === 'approve'
                  ? 'Optional: short note for audit log'
                  : 'Optional: explain rejection so submitter knows why'}
                style={{ width: '100%', minHeight: '70px', fontSize: '13px', resize: 'vertical', marginBottom: '12px' }}
              />

              {decisionModal.mode === 'approve' && (
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
                  <input
                    type="checkbox"
                    checked={decisionForm.force}
                    onChange={e => setDecisionForm(f => ({ ...f, force: e.target.checked }))}
                    style={{ marginRight: '6px' }}
                  />
                  Force-add even if a paper with identical content already exists
                </label>
              )}

              {decisionError && (
                <div style={{
                  marginTop: '10px', color: '#dc2626', fontSize: '12px',
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                  padding: '8px 10px'
                }}>
                  {decisionError}
                </div>
              )}
            </div>
            <div className="dashboard-modal-footer">
              <button
                className="dashboard-modal-btn dashboard-modal-btn-secondary"
                onClick={closeDecisionModal}
                disabled={decisionSubmitting}
              >
                Cancel
              </button>
              <button
                className="dashboard-modal-btn"
                style={{
                  background: decisionModal.mode === 'approve' ? '#10b981' : '#dc2626',
                  color: '#fff',
                  borderColor: decisionModal.mode === 'approve' ? '#10b981' : '#dc2626',
                  opacity: decisionSubmitting ? 0.6 : 1,
                }}
                onClick={submitDecision}
                disabled={decisionSubmitting}
              >
                {decisionSubmitting
                  ? 'Working…'
                  : decisionModal.mode === 'approve' ? 'Approve & Promote' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewQueue;
