import React, { useState, useEffect } from 'react';
import { reviewsAPI } from '../../api/reviews';
import '../dashboard.css';

/**
 * Human-readable labels for the structured fail-reason taxonomy. Mirrors
 * the reviewer's `ReviewDetail.jsx` map so the admin sees the exact
 * wording the reviewer ticked at vote time (instead of raw enum slugs).
 *
 * Keep in sync with `backend/config.py::FAIL_REASON_TAXONOMY`.
 */
const FAIL_REASON_LABELS = {
  suspected_paraphrase:  'Suspected paraphrasing of existing corpus',
  insufficient_citation: 'Insufficient citation',
  low_content_quality:   'Content quality below threshold',
  out_of_scope:          'Out of CS scope',
  other:                 'Other (see comment)',
};

/**
 * Human-readable label for an assignment_status enum value. Reused by
 * the per-reviewer cards in the admin "Review Details" modal so the
 * status badge reads naturally ("Completed", "Declined") instead of
 * the raw lowercase slug.
 *
 * The `voted` row is labeled "Completed" (and rendered with the muted
 * `.completed` grey badge — see `dashboard.css`) rather than the older
 * green "Voted" pill, because the green tint was misleading: a reviewer
 * who voted *fail* still got a green status pill. The actual pass/fail
 * outcome lives in a separate "Vote: …" badge on the same card.
 */
const ASSIGNMENT_STATUS_LABELS = {
  assigned:  'Assigned',
  accepted:  'Accepted',
  voted:     'Completed',
  declined:  'Declined',
  expired:   'Expired',
  cancelled: 'Closed by admin',
};

const INVITE_STATUS_LABELS = {
  pending:  'Pending',
  consumed: 'Consumed',
  expired:  'Expired',
  revoked:  'Revoked',
};

const INVITE_STATUS_CLASSES = {
  pending:  'pending',
  consumed: 'low',
  expired:  'high',
  revoked:  'critical',
};

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

/**
 * Compact `YYYY-MM-DD · HH:MM` formatter used inside the reviewer
 * cards. Returns `null` for missing inputs so callers can short-circuit
 * the surrounding label, and silently swallows malformed strings instead
 * of crashing the modal.
 */
function formatReviewDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
    hour:  '2-digit',
    minute: '2-digit',
  });
}

/**
 * Single reviewer entry inside the admin "Review Details" modal.
 *
 * Replaces the previous narrow, ellipsis-truncated table cell so that:
 *   1. The reviewer's full comment is always visible (no hover-only).
 *   2. The structured fail_reasons checklist is rendered as chips with
 *      human-readable labels, exactly as the reviewer saw them at vote
 *      time.
 *   3. Decline / expiry / admin-cancel rows show a dedicated banner
 *      explaining *why* the assignment is inactive.
 *   4. Lifecycle timestamps (assigned/accepted/voted) are surfaced for
 *      audit trace.
 */
function ReviewerPanelCard({ assignment, index }) {
  const status = assignment.assignment_status || '';
  const isInactive = ['declined', 'expired', 'cancelled'].includes(status);
  const vote = assignment.vote;

  // Status badge variant. `voted` uses the muted `completed` grey so
  // the status pill no longer conflates with the pass-colored vote
  // outcome badge that sits next to it on the same card.
  const statusCls =
    status === 'voted'    ? 'completed' :
    status === 'accepted' ? 'medium' :
    isInactive             ? 'high' :
                             'pending';

  // Left-border accent on the card: green/red for pass/fail, blue when
  // the reviewer has actively accepted the assignment and is working on
  // the review but hasn't voted yet, grey when the assignment is still
  // untouched (or vote is moot because the row is inactive).
  const cardVariant =
    vote === 'pass'                        ? 'vote-pass'        :
    vote === 'fail'                        ? 'vote-fail'        :
    (status === 'accepted' && !isInactive) ? 'vote-in-progress' :
                                             'vote-pending';

  // Reviewer identity. Admin gets the full snapshot; we fall back to the
  // numeric id so test fixtures without a snapshot still render cleanly.
  const reviewerLabel =
    assignment.reviewer_snapshot?.username
      ? `@${assignment.reviewer_snapshot.username}`
      : (assignment.reviewer_id ? `Reviewer #${assignment.reviewer_id}` : `Reviewer ${index + 1}`);
  const institution = assignment.reviewer_snapshot?.institution_name;

  // Human-readable explainer for inactive assignments. Mirrors the
  // logic of the old "Comment" cell so admins still see *why* a row is
  // missing a vote.
  let inactiveExplainer = null;
  if (status === 'declined') {
    inactiveExplainer = assignment.decline_reason
      ? `Reviewer declined — “${assignment.decline_reason}”.`
      : 'Reviewer declined without leaving a reason.';
  } else if (status === 'expired') {
    inactiveExplainer = 'Assignment auto-expired (deadline passed without a response).';
  } else if (status === 'cancelled') {
    const reason = assignment.cancellation_reason;
    if (reason === 'admin_finalized_approve') {
      inactiveExplainer = 'Closed by admin — submission was approved before this reviewer voted.';
    } else if (reason === 'admin_finalized_reject') {
      inactiveExplainer = 'Closed by admin — submission was rejected before this reviewer voted.';
    } else if (reason) {
      inactiveExplainer = `Closed by admin — ${reason}.`;
    } else {
      inactiveExplainer = 'Closed by admin before this reviewer voted.';
    }
  }

  // Lifecycle timestamps we want to surface. Order matters: we render
  // the most informative one for the current state.
  const assignedAt = formatReviewDateTime(assignment.assigned_at);
  const acceptedAt = formatReviewDateTime(assignment.accepted_at);
  const votedAt    = formatReviewDateTime(assignment.completed_at);
  const declinedAt = formatReviewDateTime(assignment.declined_at);
  const expiredAt  = formatReviewDateTime(assignment.expired_at);
  const cancelledAt = formatReviewDateTime(assignment.cancelled_at);
  const deadlineAt = formatReviewDateTime(assignment.deadline_at);

  let metaTimestamp = null;
  if (status === 'voted' && votedAt)            metaTimestamp = `Voted ${votedAt}`;
  else if (status === 'declined' && declinedAt) metaTimestamp = `Declined ${declinedAt}`;
  else if (status === 'expired' && expiredAt)   metaTimestamp = `Expired ${expiredAt}`;
  else if (status === 'cancelled' && cancelledAt) metaTimestamp = `Closed ${cancelledAt}`;
  else if (status === 'accepted' && acceptedAt) metaTimestamp = `Accepted ${acceptedAt}`;
  else if (assignedAt)                          metaTimestamp = `Assigned ${assignedAt}`;

  const hasComment = !!(assignment.comment && assignment.comment.trim());
  const failReasons = Array.isArray(assignment.fail_reasons) ? assignment.fail_reasons : [];

  return (
    <div className={`review-panel-card ${cardVariant} ${isInactive ? 'inactive' : ''}`}>
      <div className="review-panel-card-header">
        <span className="review-panel-reviewer" title={institution || undefined}>
          {reviewerLabel}
          {institution && (
            <span style={{ fontWeight: 400, color: '#64748b', fontSize: '12px' }}>
              · {institution}
            </span>
          )}
        </span>

        <span className={`dashboard-risk-badge ${statusCls}`} style={{ fontSize: '11px' }}>
          {ASSIGNMENT_STATUS_LABELS[status] || status || 'Unknown'}
        </span>

        {vote ? (
          <span
            className={`dashboard-risk-badge ${vote === 'pass' ? 'low' : 'high'}`}
            style={{ fontSize: '11px' }}
          >
            Vote: {vote === 'pass' ? 'Pass' : 'Fail'}
          </span>
        ) : !isInactive ? (
          <span className="dashboard-risk-badge pending" style={{ fontSize: '11px' }}>
            Vote: Pending
          </span>
        ) : null}

        {assignment.conflict_flag ? (
          <span className="review-panel-conflict-chip" title="Same-institution conflict was overridden to fill the panel.">
            ⚠ Conflict overridden
          </span>
        ) : null}

        {metaTimestamp && (
          <span className="review-panel-meta">{metaTimestamp}</span>
        )}
        {!isInactive && status !== 'voted' && deadlineAt && (
          <span className="review-panel-meta" style={{ color: '#92400e' }}>
            · Due {deadlineAt}
          </span>
        )}
      </div>

      {isInactive ? (
        <div className="review-panel-inactive-banner">
          <span className="review-panel-inactive-icon" aria-hidden="true">ℹ</span>
          <span>{inactiveExplainer}</span>
        </div>
      ) : (
        <>
          {/* Ticked failure-reason chips — only shown for fail votes. */}
          {vote === 'fail' && failReasons.length > 0 && (
            <>
              <div className="review-panel-section-label">Reasons cited</div>
              <div className="review-panel-reasons">
                {failReasons.map(r => (
                  <span
                    key={r}
                    className="dashboard-risk-badge high"
                    style={{ fontSize: '11px' }}
                  >
                    {FAIL_REASON_LABELS[r] || r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </>
          )}
          {vote === 'fail' && failReasons.length === 0 && (
            <>
              <div className="review-panel-section-label">Reasons cited</div>
              <div className="review-panel-comment empty">
                No structured reasons were recorded for this fail vote.
              </div>
            </>
          )}

          {/* Reviewer comment — full text, wrapping, no hover-only. */}
          {(vote || hasComment) && (
            <>
              <div className="review-panel-section-label">Comment</div>
              {hasComment ? (
                <p className="review-panel-comment">{assignment.comment}</p>
              ) : (
                <p className="review-panel-comment empty">
                  {vote
                    ? 'Reviewer did not leave a written comment.'
                    : 'No comment yet — reviewer has not voted.'}
                </p>
              )}
            </>
          )}

          {/* "Accepted but not yet voted" placeholder so the card still
              has body content and admins can see the reviewer is
              engaged. */}
          {!vote && status === 'accepted' && !hasComment && (
            <div className="review-panel-inactive-banner" style={{
              background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af',
            }}>
              <svg
                className="review-panel-inactive-icon"
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              <span>Reviewer accepted the assignment and is preparing their vote.</span>
            </div>
          )}
          {!vote && status === 'assigned' && (
            <div className="review-panel-inactive-banner">
              <svg
                className="review-panel-inactive-icon"
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              <span>Awaiting reviewer response (assignment not yet accepted).</span>
            </div>
          )}
        </>
      )}
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
  const [inviteModal, setInviteModal] = useState(null); // { submissionId, filename }
  const [inviteForm, setInviteForm] = useState({ email: '', force: false });
  const [inviteError, setInviteError] = useState(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResultMsg, setInviteResultMsg] = useState({});
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

  const openInviteModal = (submission) => {
    setInviteForm({ email: '', force: false });
    setInviteError(null);
    setInviteModal({
      submissionId: submission.id,
      filename: submission.filename,
      reviewStatus: submission.review_status,
    });
  };

  const closeInviteModal = () => {
    setInviteModal(null);
    setInviteError(null);
    setInviteSubmitting(false);
  };

  const submitInvite = async () => {
    if (!inviteModal) return;
    if (!inviteForm.email.trim()) {
      setInviteError('Institutional email is required.');
      return;
    }
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const res = await reviewsAPI.adminCreateInvite(
        inviteModal.submissionId,
        inviteForm.email.trim(),
        inviteForm.force
      );
      setInviteResultMsg(prev => ({
        ...prev,
        [inviteModal.submissionId]: {
          type: 'ok',
          text: `Invitation sent to ${res.data?.institutional_email || inviteForm.email.trim()}.`,
        },
      }));
      closeInviteModal();
      if (detailModal && detailModal.submission_id === inviteModal.submissionId) {
        try {
          const detail = await reviewsAPI.adminGetSubmissionDetail(inviteModal.submissionId);
          setDetailModal(detail.data);
        } catch { /* ignore */ }
      }
    } catch (err) {
      const apiMsg = err.response?.data?.error || 'Failed to send invitation.';
      setInviteError(apiMsg);
    } finally {
      setInviteSubmitting(false);
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
    const isPanelIncomplete = reviewStatus !== 'awaiting_admin';
    if (isPanelIncomplete && !decisionForm.reason.trim()) {
      setDecisionError('A reason is required when overriding a request before the panel has finished voting.');
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
              {/*
                `.auth-input-field` defaults to `padding: 12px 14px` with
                `line-height: 1.5`, which leaves only ~16px of content
                height inside the fixed 40px box and clips the option
                label along the bottom. Zero out vertical padding via
                the `paddingTop` / `paddingBottom` longhands so the
                `padding-right: 40px` reserved for the custom caret in
                `select.auth-input-field` is preserved.
              */}
              <select 
                value={status} 
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="auth-input-field"
                style={{ width: '220px', height: '40px', marginBottom: 0, fontSize: '14px', paddingTop: 0, paddingBottom: 0 }}
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
                        {/* Block 6: inline Approve/Reject for awaiting_admin.
                            Uses the green/red outlined-pill variants of
                            `dashboard-view-link` so the buttons match the
                            outline → tinted-fill hover treatment used by
                            the Approve & Promote / Reject buttons in the
                            Review Details modal. */}
                        {req.review_status === 'awaiting_admin' && (
                          <>
                            <button
                              className="dashboard-view-link approve"
                              onClick={() => openDecisionModal('approve', req)}
                            >
                              Approve
                            </button>
                            <button
                              className="dashboard-view-link reject"
                              onClick={() => openDecisionModal('reject', req)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {!['approved', 'rejected', 'awaiting_admin'].includes(req.review_status) && (
                          <button
                            className="dashboard-view-link"
                            onClick={() => openInviteModal(req)}
                          >
                            Invite Reviewer
                          </button>
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
                      {inviteResultMsg[req.id] && (
                        <div style={{
                          fontSize: '11px', marginTop: '4px',
                          color: inviteResultMsg[req.id].type === 'ok' ? '#10b981' : '#dc2626'
                        }}>
                          {inviteResultMsg[req.id].text}
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
          <div className="dashboard-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '760px', width: '95%' }}>
            <div className="dashboard-modal-header">
              <div style={{ minWidth: 0 }}>
                <h3 className="dashboard-modal-title">Review Details</h3>
                {detailModal?.filename && (
                  <p style={{
                    margin: '4px 0 0', fontSize: '13px', color: '#64748b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '520px',
                  }}>
                    {detailModal.filename}
                    <span style={{ color: '#94a3b8', marginLeft: '6px' }}>
                      · Submission #{detailModal.submission_id}
                    </span>
                  </p>
                )}
              </div>
              <button className="dashboard-modal-close" onClick={() => setDetailModal(null)}>✕</button>
            </div>
            <div className="dashboard-modal-body review-detail-modal-body">
              {detailLoading ? (
                <p style={{ color: '#64748b' }}>Loading…</p>
              ) : detailModal?.error ? (
                <p style={{ color: '#dc2626' }}>{detailModal.error}</p>
              ) : (
                <>
                  {/* Top-of-modal summary strip: status, outcome, vote
                      tallies. Replaces the inline label/value row. */}
                  <div className="review-summary-grid">
                    <div className="review-summary-stat">
                      <span className="review-summary-stat-label">Status</span>
                      <span className="review-summary-stat-value">
                        <span className={`dashboard-risk-badge ${
                          detailModal.review_status === 'approved' ? 'low' :
                          detailModal.review_status === 'rejected' ? 'high' :
                          detailModal.review_status === 'awaiting_admin' ? 'medium' : 'pending'
                        }`} style={{ fontSize: '11px' }}>
                          {(detailModal.review_status || '—')
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </span>
                    </div>
                    <div className="review-summary-stat">
                      <span className="review-summary-stat-label">Panel Outcome</span>
                      <span className="review-summary-stat-value">
                        {detailModal.review_outcome ? (
                          <span className={`dashboard-risk-badge ${detailModal.review_outcome === 'pass' ? 'low' : 'high'}`}
                                style={{ fontSize: '11px' }}>
                            {detailModal.review_outcome === 'pass' ? 'Pass' : 'Fail'}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '13px' }}>Pending</span>
                        )}
                      </span>
                    </div>
                    <div className="review-summary-stat">
                      <span className="review-summary-stat-label">Pass Votes</span>
                      <span className="review-summary-stat-value" style={{ color: '#059669' }}>
                        {detailModal.pass_votes ?? 0}
                      </span>
                    </div>
                    <div className="review-summary-stat">
                      <span className="review-summary-stat-label">Fail Votes</span>
                      <span className="review-summary-stat-value" style={{ color: '#dc2626' }}>
                        {detailModal.fail_votes ?? 0}
                      </span>
                    </div>
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
                      background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px',
                      borderLeft: `4px solid ${detailModal.admin_decision === 'approved' ? '#10b981' : '#dc2626'}`,
                      padding: '12px 14px', marginBottom: '18px', fontSize: '13px'
                    }}>
                      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ color: '#1e293b' }}>Admin Decision:</strong>
                        <span className={`dashboard-risk-badge ${detailModal.admin_decision === 'approved' ? 'low' : 'high'}`}
                              style={{ fontSize: '11px' }}>
                          {detailModal.admin_decision === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                        {detailModal.admin_decided_at && (
                          <span style={{ color: '#64748b' }}>
                            on {formatDate(detailModal.admin_decided_at)}
                          </span>
                        )}
                      </div>
                      {detailModal.admin_decision_reason && (
                        <div style={{ color: '#374151', lineHeight: 1.5 }}>
                          <strong>Reason:</strong> {detailModal.admin_decision_reason}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="review-panel-heading" style={{ marginTop: '8px' }}>
                    <h4>Reviewer Invitations</h4>
                    {detailModal.invites?.length > 0 && (
                      <span className="review-panel-heading-hint">
                        {detailModal.invites.length} invite{detailModal.invites.length === 1 ? '' : 's'} sent
                      </span>
                    )}
                  </div>
                  {(!detailModal.invites || detailModal.invites.length === 0) ? (
                    <div className="review-panel-empty">
                      No reviewer invitations have been sent yet.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
                      {detailModal.invites.map((inv) => (
                        <div
                          key={inv.id}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                              {inv.institutional_email}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              {inv.sent_at ? `Sent ${formatDate(inv.sent_at)}` : 'Not sent yet'}
                              {inv.consumed_at && <> · Consumed {formatDate(inv.consumed_at)}</>}
                            </div>
                          </div>
                          <span
                            className={`dashboard-risk-badge ${INVITE_STATUS_CLASSES[inv.status] || 'pending'}`}
                            style={{ fontSize: '11px' }}
                          >
                            {INVITE_STATUS_LABELS[inv.status] || inv.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="review-panel-heading">
                    <h4>Reviewer Panel</h4>
                    {detailModal.assignments?.length > 0 && (
                      <span className="review-panel-heading-hint">
                        {detailModal.assignments.length} reviewer{detailModal.assignments.length === 1 ? '' : 's'} assigned
                      </span>
                    )}
                    {/* Decline-handling Step 5: per-submission decline-churn
                        badge. Surfaces how many reviewers have declined
                        *this* submission so admins notice churn without
                        opening the Reviewer Behaviour page.

                        Counted from the same `assignments` array (which
                        the backend serializes from `submissions.review_votes`).
                        See .junie/plans/decline-handling-implementation.md. */}
                    {(() => {
                      const priorDeclines = (detailModal.assignments || []).filter(
                        (a) => a.assignment_status === 'declined'
                      ).length;
                      if (!priorDeclines) return null;
                      return (
                        <span
                          className="dashboard-risk-badge medium"
                          style={{ fontSize: '11px', marginLeft: '8px' }}
                          title="Number of reviewers who declined this submission. High churn may indicate a topic-fit or pool-size problem."
                        >
                          {priorDeclines} prior decline{priorDeclines === 1 ? '' : 's'} on this submission
                        </span>
                      );
                    })()}
                  </div>

                  {(!detailModal.assignments || detailModal.assignments.length === 0) ? (
                    <div className="review-panel-empty">
                      No reviewers have been assigned to this submission yet.
                    </div>
                  ) : (
                    <div>
                      {detailModal.assignments.map((a, i) => (
                        <ReviewerPanelCard
                          key={a.assignment_id || a.reviewer_id || i}
                          assignment={a}
                          index={i}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="dashboard-modal-footer">
              {/* Block 6: Approve/Reject for awaiting_admin (and override
                  before the panel has finished voting). Styled as
                  outline-with-tinted-hover buttons via the new
                  `dashboard-modal-btn-success` / `dashboard-modal-btn-reject`
                  variants — see `dashboard.css`. */}
              {detailModal && !detailModal.error
                && detailModal.review_status
                && !['approved', 'rejected'].includes(detailModal.review_status) && (
                <>
                  <button
                    className="dashboard-modal-btn dashboard-modal-btn-success"
                    onClick={() => openDecisionModal('approve', detailModal)}
                  >
                    Approve & Promote
                  </button>
                  <button
                    className="dashboard-modal-btn dashboard-modal-btn-reject"
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

      {/* Invite reviewer modal */}
      {inviteModal && (
        <div className="dashboard-modal-overlay" onClick={closeInviteModal}>
          <div className="dashboard-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '95%' }}>
            <div className="dashboard-modal-header">
              <h3 className="dashboard-modal-title">Invite Reviewer</h3>
              <button className="dashboard-modal-close" onClick={closeInviteModal}>✕</button>
            </div>
            <div className="dashboard-modal-body">
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
                Submission #{inviteModal.submissionId}
                {inviteModal.filename && <> — <em>{inviteModal.filename}</em></>}
              </p>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                Institutional email
              </label>
              <input
                type="email"
                className="auth-input-field"
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                style={{ width: '100%', marginBottom: '12px', height: '38px', fontSize: '13px' }}
                placeholder="expert@institution.edu"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
                <input
                  type="checkbox"
                  checked={inviteForm.force}
                  onChange={e => setInviteForm(f => ({ ...f, force: e.target.checked }))}
                />
                Allow non-allowlist domain (admin override)
              </label>
              {inviteError && (
                <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '10px' }}>{inviteError}</p>
              )}
            </div>
            <div className="dashboard-modal-footer">
              <button
                className="dashboard-modal-btn dashboard-modal-btn-secondary"
                onClick={closeInviteModal}
                disabled={inviteSubmitting}
              >
                Cancel
              </button>
              <button
                className="dashboard-modal-btn dashboard-modal-btn-success"
                onClick={submitInvite}
                disabled={inviteSubmitting}
              >
                {inviteSubmitting ? 'Sending…' : 'Send Invite'}
              </button>
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
                  ⚠ The reviewer panel hasn’t finished voting yet (status: <strong>{decisionModal.reviewStatus}</strong>).
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
                className={
                  'dashboard-modal-btn ' +
                  (decisionModal.mode === 'approve'
                    ? 'dashboard-modal-btn-success'
                    : 'dashboard-modal-btn-reject')
                }
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
