import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import '../dashboard.css';

const STATUS_LABELS = {
  assigned:  { label: 'Assigned',  cls: 'pending'  },
  accepted:  { label: 'Accepted',  cls: 'medium'   },
  voted:     { label: 'Completed', cls: 'low'       },
  declined:  { label: 'Declined',  cls: 'high'      },
  expired:   { label: 'Expired',   cls: 'high'      },
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
    label: 'Declined / Expired',
    description: 'Assignments you declined or that passed the 72-hour review window.',
    empty: 'No declined or expired assignments. Anything you’ve declined or that auto-expired past its 72h deadline will appear here.',
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

function DeclineDialog({ open, onCancel, onConfirm, submitting }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);

  if (!open) return null;
  const tooLong = reason.length > 500;

  return (
    <div className="dashboard-modal-overlay" onClick={onCancel}>
      <div className="dashboard-modal reviewer-decline-modal" onClick={e => e.stopPropagation()}>
        <div className="dashboard-modal-header">
          <h3 className="dashboard-modal-title">Decline Review Assignment</h3>
          <button className="dashboard-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="dashboard-modal-body">
          <p className="reviewer-decline-help">
            We will instantly assign a replacement reviewer. A short reason
            helps the admin understand the decline (optional, max 500
            characters).
          </p>
          <textarea
            className={`reviewer-decline-textarea${tooLong ? ' error' : ''}`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="e.g., Conflict of interest with the topic; will be unavailable this week…"
          />
          <div className="reviewer-decline-counter">
            {reason.length}/500
          </div>
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
            onClick={() => onConfirm(reason.trim() || null)}
            disabled={submitting || tooLong}
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

  const handleDeclineConfirm = async (reason) => {
    const submissionId = declineFor;
    if (!submissionId) return;
    setBusyRow(submissionId);
    setRowError(prev => ({ ...prev, [submissionId]: null }));
    try {
      await reviewsAPI.declineAssignment(submissionId, reason);
      setDeclineFor(null);
      fetchAssignments();
      fetchCounts();
      // Block 7: notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to decline assignment.';
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

  return (
    <div className="reviewer-dashboard-shell">
      <main className="dashboard-main reviewer-dashboard-main">
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
                    const isInactive = ['declined', 'expired'].includes(a.assignment_status);
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
                                {a.assignment_status === 'declined' ? 'Declined' : 'Expired'}
                                {a.decline_reason ? ` — ${a.decline_reason}` : ''}
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
