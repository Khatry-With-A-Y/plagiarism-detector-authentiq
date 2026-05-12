import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import { reviewersAPI } from '../../api/reviewers';
import '../dashboard.css';

const STATUS_LABELS = {
  assigned:  { label: 'Assigned',         cls: 'pending'   },
  accepted:  { label: 'Accepted',         cls: 'medium'    },
  // Post-vote rows use the muted-grey `.completed` badge instead of the
  // green `.low` (pass) palette. The green tint previously implied a
  // pass outcome even when the reviewer had voted *fail*; the actual
  // pass/fail outcome is conveyed elsewhere (e.g., the read-only
  // "Your Submitted Review" panel in `ReviewDetail.jsx`).
  voted:     { label: 'Completed',        cls: 'completed' },
  declined:  { label: 'Declined',         cls: 'high'      },
  expired:   { label: 'Expired',          cls: 'high'      },
  // Admin force-promoted/rejected the submission before this reviewer voted.
  cancelled: { label: 'Closed by admin',  cls: 'high'      },
};

// Block 7: tab definitions for the reviewer dashboard. Each tab maps to the
// backend `?status=` filter and to a friendly empty-state copy.
const TABS = [
  {
    key:   'pending',
    label: 'Pending',
    description: 'Assignments waiting for acceptance or active review work.',
    empty: 'No pending assignments. New work will land here when an admin assigns you to a submission.',
  },
  {
    key:   'completed',
    label: 'Completed',
    description: 'Reviews that were submitted successfully and are available for reference.',
    empty: 'No completed reviews yet. Reviews you’ve voted on will appear here for reference.',
  },
  {
    key:   'declined_expired',
    label: 'Declined / Closed',
    description: 'Assignments you declined, that passed the 72-hour review window, or that the admin finalized without your vote.',
    empty: 'No declined, expired, or admin-closed assignments. Anything you’ve declined, that auto-expired past its 72h deadline, or that the admin force-promoted/rejected will appear here.',
  },
];
const VALID_TAB_KEYS = TABS.map(t => t.key);
const DEFAULT_TAB = 'pending';

function DeadlineCountdown({ deadlineAt, status }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!deadlineAt || !['assigned', 'accepted'].includes(status)) return;
    const update = () => {
      const diff = new Date(deadlineAt) - new Date();
      if (diff <= 0) { setLabel('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(`${h}h ${m}m remaining`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [deadlineAt, status]);

  if (!label) return null;
  const urgent = label !== 'Expired' && new Date(deadlineAt) - new Date() < 12 * 3600 * 1000;
  return (
    <span className={`reviewer-deadline${urgent ? ' urgent' : ''}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {label}
    </span>
  );
}

// Decline-reason taxonomy — keep in sync with backend/config.py::DECLINE_REASON_TAXONOMY.
// The two `excluded` entries do NOT count toward the rolling-window pause threshold.
const DECLINE_REASON_CATEGORIES = [
  { value: 'conflict_of_interest', label: 'Conflict of Interest', excluded: true },
  { value: 'out_of_expertise',     label: 'Out of My Expertise',  excluded: true },
  { value: 'workload',             label: 'Workload too high',     excluded: false },
  { value: 'unavailable',          label: 'Unavailable this week', excluded: false },
  { value: 'other',                label: 'Other',                 excluded: false },
];

function DeclineDialog({ open, onCancel, onConfirm, submitting }) {
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('');
  const [localError, setLocalError] = useState(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setCategory('');
      setLocalError(null);
    }
  }, [open]);

  if (!open) return null;
  const tooLong = reason.length > 500;
  const canConfirm = !!category && !tooLong && !submitting;

  return (
    <div className="dashboard-modal-overlay" onClick={onCancel}>
      <div className="dashboard-modal reviewer-decline-modal" onClick={e => e.stopPropagation()}>
        <div className="dashboard-modal-header">
          <h3 className="dashboard-modal-title">Decline Review Assignment</h3>
          <button className="dashboard-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="dashboard-modal-body">
          <p className="reviewer-decline-help">
            We will instantly assign a replacement reviewer. Please pick a
            category so the admin understands the decline. <em>Conflict of
            Interest</em> and <em>Out of My Expertise</em> are excluded from
            the rolling-window pause threshold.
          </p>
          <label
            style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', margin: '8px 0 6px' }}
          >
            Reason category <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '13px',
              background: '#fff',
              boxSizing: 'border-box',
              outline: 'none',
              marginBottom: '12px',
            }}
          >
            <option value="" disabled>Select a reason…</option>
            {DECLINE_REASON_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}{c.excluded ? ' — does not count toward pause threshold' : ''}
              </option>
            ))}
          </select>
          <textarea
            className={`reviewer-decline-textarea${tooLong ? ' error' : ''}`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Optional details (max 500 characters)— e.g., specifics of the conflict or expertise gap."
          />
          <div className="reviewer-decline-counter">
            {reason.length}/500
          </div>
          {localError && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: '8px 0 0' }}>{localError}</p>
          )}
        </div>
        <div className="dashboard-modal-footer">
          <button
            type="button"
            className="dashboard-modal-btn dashboard-modal-btn-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dashboard-modal-btn dashboard-modal-btn-danger"
            onClick={() => {
              if (!category) {
                setLocalError('Please select a reason category before confirming.');
                return;
              }
              onConfirm(reason.trim() || null, category);
            }}
            disabled={!canConfirm}
            title={!category ? 'Select a reason category to enable Confirm.' : undefined}
          >
            {submitting ? 'Declining…' : 'Confirm Decline'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewerStatCard({ label, value, hint, iconClassName, icon }) {
  return (
    <div className="dashboard-stat-card reviewer-stat-card">
      <div className="dashboard-stat-content">
        <p className="dashboard-stat-label">{label}</p>
        <h3 className="dashboard-stat-value">{value}</h3>
        <p className="reviewer-stat-hint">{hint}</p>
      </div>
      <div className={`dashboard-stat-icon ${iconClassName}`}>
        {icon}
      </div>
    </div>
  );
}

export default function ReviewerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = VALID_TAB_KEYS.includes(tabParam) ? tabParam : DEFAULT_TAB;

  const [assignments, setAssignments] = useState([]);
  const [counts, setCounts] = useState({
    pending: 0, completed: 0, declined_expired: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-row action state
  const [busyRow, setBusyRow] = useState(null);   // submission_id of in-flight action
  const [rowError, setRowError] = useState({});   // { [submission_id]: message }
  const [declineFor, setDeclineFor] = useState(null);  // submission_id awaiting decline confirm

  // Decline-handling accountability layer: self-scoped behaviour snapshot
  // used to render soft-warning / paused banners.
  const [behaviour, setBehaviour] = useState(null);

  const fetchBehaviour = () => {
    reviewersAPI.getMyBehaviour()
      .then(res => setBehaviour(res.data))
      .catch(() => { /* banner is best-effort; don't block the UI */ });
  };

  const fetchAssignments = (tab = activeTab) => {
    setLoading(true);
    setError(null);
    reviewsAPI.listAssignments(1, 50, tab)
      .then(res => setAssignments(res.data.assignments || []))
      .catch(() => setError('Failed to load assignments.'))
      .finally(() => setLoading(false));
  };

  // Pull the badge-summary in parallel so each tab header can show a count.
  // Using the existing summary endpoint avoids three separate /assignments
  // calls.
  const fetchCounts = () => {
    reviewsAPI.getAssignmentsSummary()
      .then(res => {
        const s = res.data || {};
        setCounts({
          pending:          (s.assigned_count || 0) + (s.accepted_count || 0),
          completed:        s.completed_count || 0,
          declined_expired: s.declined_or_expired_count || 0,
        });
      })
      .catch(() => { /* badge counts are best-effort; don't block the UI */ });
  };

  useEffect(() => {
    fetchAssignments(activeTab);
    fetchCounts();
    fetchBehaviour();
  }, [activeTab]);

  const switchTab = (key) => {
    if (key === activeTab) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: false });
  };

  const handleAccept = async (submissionId) => {
    setBusyRow(submissionId);
    setRowError(prev => ({ ...prev, [submissionId]: null }));
    try {
      await reviewsAPI.acceptAssignment(submissionId);
      fetchAssignments();
      fetchCounts();
      // Block 7: notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to accept assignment.';
      setRowError(prev => ({ ...prev, [submissionId]: msg }));
    } finally {
      setBusyRow(null);
    }
  };

  const handleDeclineConfirm = async (reason, category) => {
    const submissionId = declineFor;
    if (!submissionId) return;
    setBusyRow(submissionId);
    setRowError(prev => ({ ...prev, [submissionId]: null }));
    try {
      await reviewsAPI.declineAssignment(submissionId, reason, category);
      setDeclineFor(null);
      fetchAssignments();
      fetchCounts();
      // Refresh the behaviour banner: a decline could have flipped us into
      // soft-warning or paused.
      fetchBehaviour();
      // Block 7: notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      const code = err.response?.data?.code;
      const msg = code === 'INVALID_DECLINE_CATEGORY'
        ? 'That decline reason is not recognised. Please pick one from the list.'
        : (err.response?.data?.error || 'Failed to decline assignment.');
      setRowError(prev => ({ ...prev, [submissionId]: msg }));
    } finally {
      setBusyRow(null);
    }
  };

  const pendingCount = counts.pending || 0;
  const completedCount = counts.completed || 0;
  const declinedExpiredCount = counts.declined_expired || 0;
  const totalAssignments = pendingCount + completedCount + declinedExpiredCount;

  if (error) return (
    <div className="reviewer-dashboard-shell">
      <main className="dashboard-main reviewer-dashboard-main">
        <div className="dashboard-error-banner reviewer-error-banner">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchAssignments(activeTab)}
            aria-label="Retry loading assignments"
          >
            ↻
          </button>
        </div>
      </main>
    </div>
  );

  const activeTabDef = TABS.find(t => t.key === activeTab) || TABS[0];

  // Banner derivations: paused state takes precedence over soft-warning.
  const isPaused      = behaviour?.status === 'paused';
  const showSoftWarn  = !isPaused
                     && behaviour
                     && (behaviour.countable_declines ?? 0) >= (behaviour.soft_limit ?? 3);
  const pausedUntil   = behaviour?.paused_until
                        ? new Date(behaviour.paused_until.replace(' ', 'T') + 'Z')
                        : null;
  const pausedReason  = behaviour?.paused_reason;

  return (
    <div className="reviewer-dashboard-shell">
      <main className="dashboard-main reviewer-dashboard-main">
        {isPaused && (
          <section
            role="alert"
            className="dashboard-error-banner"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#7f1d1d',
              padding: '14px 16px',
              borderRadius: '12px',
              marginBottom: '20px',
              display: 'block',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              Your reviewer account is paused.
            </strong>
            <span style={{ fontSize: '13px' }}>
              You will not receive new assignments until
              {pausedUntil
                ? <> <em>{pausedUntil.toLocaleString()}</em> (window roll-over)</>
                : <> the rolling window expires</>}
              {pausedReason === 'auto:rolling_window_exceeded'
                ? ' or an admin unpauses you.'
                : pausedReason
                  ? ` — reason: ${pausedReason}.`
                  : '.'}
              {' '}You can still open and read any past assignments.
            </span>
          </section>
        )}
        {showSoftWarn && (
          <section
            role="alert"
            className="dashboard-error-banner"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#78350f',
              padding: '14px 16px',
              borderRadius: '12px',
              marginBottom: '20px',
              display: 'block',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              You are approaching the decline threshold.
            </strong>
            <span style={{ fontSize: '13px' }}>
              You have {behaviour.countable_declines} countable
              decline{behaviour.countable_declines === 1 ? '' : 's'} in the
              last {behaviour.window_days} days. Crossing
              {' '}{behaviour.hard_limit} will pause your reviewer account.
              {' '}Declines marked <em>Conflict of Interest</em> or
              {' '}<em>Out of My Expertise</em> are not counted.
            </span>
          </section>
        )}
        <section className="dashboard-welcome reviewer-welcome">
          <div className="dashboard-welcome-left reviewer-welcome-left">
            <h1 className="dashboard-welcome-title">Reviewer Workbench</h1>
            <p className="dashboard-welcome-subtitle">
              Manage your peer-review queue in one place. Accept incoming
              assignments, complete votes before deadlines, and revisit past
              reviews when needed.
            </p>
            <div className="reviewer-welcome-meta">
              <span className="dashboard-user-role reviewer">Reviewer</span>
              <span className="reviewer-welcome-meta-text">
                Active assignments automatically expire after 72 hours.
              </span>
            </div>
          </div>

          <aside className="reviewer-focus-card" aria-label="Reviewer queue summary">
            <p className="reviewer-focus-label">Current Focus</p>
            <h3 className="reviewer-focus-value">
              {pendingCount} pending assignment{pendingCount === 1 ? '' : 's'}
            </h3>
            <p className="reviewer-focus-note">
              Prioritize pending work first to keep turnaround times healthy
              and avoid automatic expiry.
            </p>
            <button
              type="button"
              className="dashboard-btn-outline reviewer-focus-btn"
              onClick={() => switchTab(DEFAULT_TAB)}
            >
              View Pending Queue
            </button>
          </aside>
        </section>

        <section className="dashboard-stats reviewer-stats">
          <ReviewerStatCard
            label="Pending Assignments"
            value={pendingCount}
            hint="Need acceptance or completion"
            iconClassName="blue"
            icon={(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="13" x2="12" y2="17" />
                <line x1="10" y1="15" x2="14" y2="15" />
              </svg>
            )}
          />
          <ReviewerStatCard
            label="Completed Reviews"
            value={completedCount}
            hint="Successfully submitted"
            iconClassName="gray"
            icon={(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 15.5l2 2 4-4" />
              </svg>
            )}
          />
          <ReviewerStatCard
            label="Declined / Expired"
            value={declinedExpiredCount}
            hint="No longer actionable"
            iconClassName="red"
            icon={(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
          />
        </section>

        <section className="dashboard-reports reviewer-assignments">
          <div className="dashboard-reports-header reviewer-assignments-header">
            <div>
              <h2>Review Assignments</h2>
              <p className="dashboard-reports-subtitle">{activeTabDef.description}</p>
            </div>
            <p className="reviewer-assignments-total">
              Tracking <strong>{totalAssignments}</strong> total assignments
            </p>
          </div>

          <div
            className="reviewer-tabs"
            role="tablist"
            aria-label="Reviewer assignment tabs"
          >
            {TABS.map(t => {
              const count = counts[t.key] || 0;
              const isActive = t.key === activeTab;

              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchTab(t.key)}
                  className={`reviewer-tab-btn${isActive ? ' active' : ''}`}
                >
                  <span>{t.label}</span>
                  <span className="reviewer-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="dashboard-empty reviewer-empty reviewer-loading-state">
              <div className="dashboard-spinner" />
              <h3>Loading assignments…</h3>
              <p>Fetching your reviewer queue.</p>
            </div>
          ) : assignments.length === 0 ? (
            <div className="dashboard-empty reviewer-empty">
              <svg className="dashboard-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <h3>No assignments in this tab</h3>
              <p className="reviewer-empty-copy">{activeTabDef.empty}</p>
            </div>
          ) : (
            <div className="reviewer-table-wrap">
              <table className="dashboard-table reviewer-table">
                <thead>
                  <tr>
                    <th>Submission</th>
                    <th>Domain</th>
                    <th>Status</th>
                    <th>Deadline</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => {
                    const st = STATUS_LABELS[a.assignment_status] || { label: a.assignment_status, cls: 'pending' };
                    const isAssigned = a.assignment_status === 'assigned';
                    const isAccepted = a.assignment_status === 'accepted';
                    const isActive = isAssigned || isAccepted;
                    const isDone = a.assignment_status === 'voted';
                    const isInactive = ['declined', 'expired', 'cancelled'].includes(a.assignment_status);
                    const busy = busyRow === a.submission_id;

                    return (
                      <tr
                        key={a.assignment_id || a.submission_id}
                        className={`reviewer-assignment-row${isInactive ? ' inactive' : ''}`}
                      >
                        <td>
                          <div className="dashboard-doc-cell">
                            <div className="dashboard-doc-icon-small reviewer-doc-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            </div>
                            <div className="dashboard-doc-info">
                              <span className="dashboard-doc-name" title={a.filename || `Submission #${a.submission_id}`}>
                                {a.filename || `Submission #${a.submission_id}`}
                              </span>
                              <span className="dashboard-doc-size">Submission #{a.submission_id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="dashboard-risk-badge pending reviewer-domain-badge">
                            {a.domain_tag || 'CS'}
                          </span>
                        </td>
                        <td>
                          <span className={`dashboard-risk-badge ${st.cls}`}>{st.label}</span>
                        </td>
                        <td>
                          {isActive
                            ? <DeadlineCountdown deadlineAt={a.deadline_at} status={a.assignment_status} />
                            : <span className="reviewer-deadline-empty">—</span>
                          }
                        </td>
                        <td>
                          <div className="dashboard-actions-cell reviewer-actions-cell">
                            {isAssigned && (
                              <>
                                <button
                                  type="button"
                                  className="dashboard-view-link reviewer-action-link accept"
                                  onClick={() => handleAccept(a.submission_id)}
                                  disabled={busy}
                                >
                                  {busy ? 'Accepting…' : 'Accept'}
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-view-link reviewer-action-link decline"
                                  onClick={() => setDeclineFor(a.submission_id)}
                                  disabled={busy}
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {isAccepted && (
                              <>
                                <button
                                  type="button"
                                  className="dashboard-view-link reviewer-action-link"
                                  onClick={() => navigate(`/reviewer/assignments/${a.submission_id}`)}
                                  disabled={busy}
                                >
                                  Open Review
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-view-link reviewer-action-link decline"
                                  onClick={() => setDeclineFor(a.submission_id)}
                                  disabled={busy}
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {isDone && (
                              <button
                                type="button"
                                className="dashboard-view-link reviewer-action-link"
                                onClick={() => navigate(`/reviewer/assignments/${a.submission_id}?readonly=1`)}
                              >
                                View Submitted
                              </button>
                            )}
                            {isInactive && (
                              <span className="reviewer-inactive-note">
                                {a.assignment_status === 'declined'
                                  ? 'Declined'
                                  : a.assignment_status === 'expired'
                                    ? 'Expired'
                                    : 'Closed by admin'}
                                {a.assignment_status === 'declined' && a.decline_reason
                                  ? ` — ${a.decline_reason}`
                                  : ''}
                                {a.assignment_status === 'cancelled' && a.cancellation_reason
                                  ? ` — ${a.cancellation_reason === 'admin_finalized_approve'
                                              ? 'submission was approved'
                                              : a.cancellation_reason === 'admin_finalized_reject'
                                                ? 'submission was rejected'
                                                : a.cancellation_reason}`
                                  : ''}
                              </span>
                            )}
                          </div>
                          {rowError[a.submission_id] && (
                            <div className="reviewer-row-error">
                              {rowError[a.submission_id]}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <DeclineDialog
        open={declineFor !== null}
        onCancel={() => (busyRow ? null : setDeclineFor(null))}
        onConfirm={handleDeclineConfirm}
        submitting={busyRow !== null && busyRow === declineFor}
      />
    </div>
  );
}
