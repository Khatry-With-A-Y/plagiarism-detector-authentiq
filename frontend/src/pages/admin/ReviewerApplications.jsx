import React, { useState, useEffect } from "react";
import reviewersAPI from "../../api/reviewers";
import notificationsAPI from "../../api/notifications";
import "../dashboard.css";
import "../auth.css";

function ReviewerApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  const [decisionModal, setDecisionModal] = useState({ show: false, app: null, decision: '', reason: '' });
  const [bioModal, setBioModal] = useState({ show: false, app: null });
  const [appHistory, setAppHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Block 7 (Stage 7c): revoke confirmation modal
  const [revokeModal, setRevokeModal] = useState({ show: false, app: null, reason: '' });
  const [revokeError, setRevokeError] = useState(null);

  useEffect(() => {
    fetchApplications();
  }, [filter, page]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const response = await reviewersAPI.adminListApplications(filter, page);
      const data = response.data;
      setApplications(data.applications);
      setTotal(data.total);
    } catch (err) {
      setError("Failed to fetch applications");
    } finally {
      setLoading(false);
    }
  };

  const openBioModal = async (app) => {
    setBioModal({ show: true, app });
    setAppHistory([]);
    setHistoryLoading(true);
    try {
      const res = await notificationsAPI.getUserNotificationsForAdmin(app.user_id);
      // Block 7 (Stage 7c): include the full reviewer-onboarding journey in
      // the history timeline — submission, email verification, admin
      // approve/reject, and (most importantly) revocation. The previous
      // filter only matched titles containing "application", which silently
      // hid the "Reviewer Status Revoked" notification (and the admin's
      // typed reason that rides along in its message body).
      const relevant = (res.data.notifications || []).filter(n => {
        const t = (n.title || '').toLowerCase();
        return (
          t.includes('application') ||
          t.includes('reviewer status') ||
          t.includes('revoke') ||
          t.includes('institutional email')
        );
      });
      setAppHistory(relevant);
    } catch {
      setAppHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDecisionClick = (app, decision) => {
    setDecisionModal({ show: true, app, decision, reason: '' });
  };

  const handleConfirmDecision = async () => {
    setIsSubmitting(true);
    try {
      await reviewersAPI.adminDecide(decisionModal.app.user_id, decisionModal.decision, decisionModal.reason);
      setDecisionModal({ show: false, app: null, decision: '', reason: '' });
      fetchApplications();
      // Block 7 (Stage 7c): admin just approved/rejected a pending application —
      // refresh the navbar "Reviewer Onboarding" count immediately so the
      // badge number updates without waiting for the 60s polling tick.
      window.dispatchEvent(new Event('reviewer-apps:refresh'));
    } catch (err) {
      alert("Error submitting decision: " + (err.response?.data?.error || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Block 7 (Stage 7c): revoke handler — flips role to 'user', stamps
  // revoked_at, leaves historical assignments untouched (audit trail
  // lives in their `reviewer_snapshot`).
  const handleRevokeClick = (app) => {
    setRevokeError(null);
    setRevokeModal({ show: true, app, reason: '' });
  };

  const handleConfirmRevoke = async () => {
    setIsSubmitting(true);
    setRevokeError(null);
    try {
      await reviewersAPI.adminRevoke(
        revokeModal.app.user_id,
        revokeModal.reason.trim() || null,
      );
      setRevokeModal({ show: false, app: null, reason: '' });
      fetchApplications();
    } catch (err) {
      setRevokeError(err.response?.data?.error || 'Revoke failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard-card" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
            <h2 className="dashboard-card-title" style={{ margin: 0 }}>Reviewer Onboarding Queue</h2>
            <p className="dashboard-subtitle">Manage and verify new reviewer applications</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>Filter by Status:</span>
            <select 
                className="auth-input-field" 
                style={{ height: '40px', padding: '0 12px', width: '160px', cursor: 'pointer' }}
                value={filter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                {/* Block 7 (Stage 7c): "Revoked" is a synthetic status — backend
                    treats it as `revoked_at IS NOT NULL`, and the plain
                    "Rejected" filter now excludes these rows so admins can
                    distinguish "application rejected" from "ex-reviewer
                    revoked". */}
                <option value="revoked">Revoked</option>
                <option value="">All Statuses</option>
            </select>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-loading" style={{ padding: '60px' }}>Loading applications...</div>
      ) : error ? (
        <div className="form-error" style={{ margin: '20px' }}>{error}</div>
      ) : applications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px', opacity: 0.5 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <p>No reviewer applications found matching the current filter.</p>
        </div>
      ) : (
        <div className="dashboard-table-container">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Applicant</th>
                <th style={{ textAlign: 'left' }}>Institution & Affiliation</th>
                <th>Status</th>
                <th>Applied On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.user_id}>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{app.username}</span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{app.email}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>{app.institution_name}</span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{app.affiliation}</span>
                    </div>
                  </td>
                  <td>
                    {/* Block 7 (Stage 7c): show 'REVOKED' badge when reviewer was revoked. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                      <span className={`dashboard-risk-badge ${
                        app.revoked_at ? 'high' :
                        app.application_status === 'approved' ? 'low' :
                        app.application_status === 'pending' ? 'medium' : 'high'
                      }`}>
                          {app.revoked_at ? 'REVOKED' : app.application_status.toUpperCase()}
                      </span>
                      {/* Institutional-email verification badge.
                          The Approve button is gated on this flag both here
                          and at the API layer; an unverified row cannot be
                          approved no matter what the UI does. */}
                      <span
                        className={`dashboard-risk-badge ${app.email_verified ? 'low' : 'high'}`}
                        title={app.email_verified
                          ? 'Applicant clicked the verification link sent to their institutional inbox.'
                          : 'Applicant has not yet verified their institutional email.'}
                        style={{ fontSize: '10px' }}
                      >
                        {app.email_verified ? 'EMAIL ✓' : 'EMAIL ✗'}
                      </span>
                    </div>
                  </td>
                  <td style={{ color: '#64748b' }}>{new Date(app.submitted_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                            className="dashboard-view-link" 
                            style={{ padding: '6px 12px' }}
                            onClick={() => openBioModal(app)}
                        >
                            View Bio
                        </button>
                        {app.application_status === 'pending' && (
                            <>
                                <button
                                    className="dashboard-view-link"
                                    style={{
                                        color: '#059669',
                                        borderColor: '#10b981',
                                        padding: '6px 12px',
                                        opacity: app.email_verified ? 1 : 0.5,
                                        cursor: app.email_verified ? 'pointer' : 'not-allowed',
                                    }}
                                    onClick={() => app.email_verified && handleDecisionClick(app, 'approved')}
                                    disabled={!app.email_verified}
                                    title={app.email_verified
                                        ? 'Approve this reviewer application.'
                                        : 'Applicant has not verified their institutional email.'}
                                >
                                    Approve
                                </button>
                                <button
                                    className="dashboard-view-link"
                                    style={{ color: '#dc2626', borderColor: '#f87171', padding: '6px 12px' }}
                                    onClick={() => handleDecisionClick(app, 'rejected')}
                                >
                                    Reject
                                </button>
                            </>
                        )}
                        {/* Block 7 (Stage 7c): Revoke action for approved, non-revoked reviewers. */}
                        {app.application_status === 'approved' && !app.revoked_at && (
                            <button
                                className="dashboard-view-link"
                                style={{ color: '#dc2626', borderColor: '#f87171', padding: '6px 12px' }}
                                onClick={() => handleRevokeClick(app)}
                                title="Revoke reviewer privileges; historical assignments remain queryable for audit."
                            >
                                Revoke
                            </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Placeholder */}
      {total > 50 && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="dashboard-view-link">Previous</button>
              <span style={{ display: 'flex', alignItems: 'center' }}>Page {page}</span>
              <button disabled={applications.length < 50} onClick={() => setPage(page + 1)} className="dashboard-view-link">Next</button>
          </div>
      )}

      {/* Decision Modal */}
      {decisionModal.show && (
          <div className="dashboard-modal-overlay">
              <div className="dashboard-modal" style={{ maxWidth: '500px' }}>
                  <div className="dashboard-modal-header">
                      <h3>{decisionModal.decision === 'approved' ? 'Approve Reviewer' : 'Reject Application'}</h3>
                      <p>Finalize onboarding decision for {decisionModal.app.username}</p>
                  </div>
                  
                  <div className="dashboard-modal-body">
                      <div className="form-group">
                          <label className="form-label">Decision Reason / Internal Notes</label>
                          <textarea 
                            className="auth-input-field"
                            style={{ minHeight: '100px', padding: '12px' }}
                            value={decisionModal.reason}
                            onChange={(e) => setDecisionModal({...decisionModal, reason: e.target.value})}
                            placeholder={decisionModal.decision === 'rejected' ? "Explain why the application was rejected (this will be visible to the user)..." : "Optional notes..."}
                          />
                      </div>
                      
                      {decisionModal.decision === 'approved' && (
                          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', fontSize: '13px', color: '#1e40af' }}>
                              <strong>Note:</strong> Approving will immediately flip the user's role to <code>reviewer</code> and grant access to the review panel.
                          </div>
                      )}
                  </div>

                  <div className="dashboard-modal-footer">
                      <button className="dashboard-modal-btn dashboard-modal-btn-secondary" onClick={() => setDecisionModal({ show: false, app: null, decision: '', reason: '' })}>
                          Cancel
                      </button>
                      <button 
                        className={`dashboard-modal-btn ${decisionModal.decision === 'approved' ? 'dashboard-modal-btn-primary' : 'dashboard-modal-btn-danger'}`}
                        disabled={isSubmitting}
                        onClick={handleConfirmDecision}
                      >
                          {isSubmitting ? "Processing..." : `Confirm ${decisionModal.decision === 'approved' ? 'Approval' : 'Rejection'}`}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Bio / Detail Modal */}
      {bioModal.show && (
          <div className="dashboard-modal-overlay">
              <div className="dashboard-modal" style={{ maxWidth: '700px' }}>
                  <div className="dashboard-modal-header">
                      <h3>Reviewer Credentials</h3>
                      <p>Full profile for {bioModal.app.username}</p>
                  </div>
                  
                  <div className="dashboard-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                          <div>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Institutional Email</label>
                              <p style={{ marginTop: '4px' }}>{bioModal.app.institutional_email}</p>
                              <span
                                className={`dashboard-risk-badge ${bioModal.app.email_verified ? 'low' : 'high'}`}
                                style={{ marginTop: '6px', display: 'inline-flex', fontSize: '11px' }}
                              >
                                {bioModal.app.email_verified ? 'Verified ✓' : 'Unverified ✗'}
                              </span>
                              {!!bioModal.app.email_verified && bioModal.app.email_verified_at && (
                                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                    Verified on {new Date(bioModal.app.email_verified_at).toLocaleString()}
                                </p>
                              )}
                          </div>
                          <div>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Institution</label>
                              <p style={{ marginTop: '4px' }}>{bioModal.app.institution_name}</p>
                          </div>
                          <div>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Affiliation</label>
                              <p style={{ marginTop: '4px' }}>{bioModal.app.affiliation}</p>
                          </div>
                          <div>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Expertise Tags</label>
                              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                  {bioModal.app.expertise_tags?.map(tag => (
                                      <span key={tag} className="dashboard-risk-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{tag}</span>
                                  ))}
                              </div>
                          </div>
                      </div>
                      
                      <div>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Biography & Credentials</label>
                          <div style={{ marginTop: '8px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155' }}>
                              {bioModal.app.bio}
                          </div>
                      </div>

                      {bioModal.app.application_status !== 'pending' && (
                          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Current Decision</label>
                              <p style={{ marginTop: '8px' }}><strong>Status:</strong> {bioModal.app.application_status.toUpperCase()}</p>
                              {bioModal.app.reviewed_at && <p><strong>Decided On:</strong> {new Date(bioModal.app.reviewed_at).toLocaleString()}</p>}
                              {bioModal.app.decision_reason && <p style={{ marginTop: '8px' }}><strong>Reason:</strong> {bioModal.app.decision_reason}</p>}
                          </div>
                      )}

                      {/* Application History Timeline */}
                      <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Application History</label>
                          {historyLoading ? (
                              <p style={{ marginTop: '8px', color: '#94a3b8', fontSize: '13px' }}>Loading history...</p>
                          ) : appHistory.length === 0 ? (
                              <p style={{ marginTop: '8px', color: '#94a3b8', fontSize: '13px' }}>No recorded history found.</p>
                          ) : (
                              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '0' }}>
                                  {appHistory.map((notif, idx) => {
                                      const isApproved = notif.type === 'success';
                                      const isRejected = notif.type === 'warning';
                                      const dotColor = isApproved ? '#10b981' : isRejected ? '#ef4444' : '#3b82f6';
                                      const bgColor = isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : '#eff6ff';
                                      const borderColor = isApproved ? '#bbf7d0' : isRejected ? '#fecaca' : '#bfdbfe';
                                      const isLast = idx === appHistory.length - 1;
                                      return (
                                          <div key={notif.id} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                                              {/* Timeline spine */}
                                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: dotColor, marginTop: '14px', flexShrink: 0, boxShadow: `0 0 0 3px ${bgColor}` }} />
                                                  {!isLast && <div style={{ width: '2px', flex: 1, backgroundColor: '#e2e8f0', marginTop: '4px' }} />}
                                              </div>
                                              {/* Event card */}
                                              <div style={{ flex: 1, marginBottom: isLast ? 0 : '8px', padding: '10px 14px', backgroundColor: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px' }}>
                                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{notif.title}</span>
                                                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                          {new Date(notif.created_at).toLocaleString()}
                                                      </span>
                                                  </div>
                                                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>{notif.message}</p>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="dashboard-modal-footer">
                      <button className="dashboard-modal-btn dashboard-modal-btn-secondary" onClick={() => setBioModal({ show: false, app: null })}>
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Block 7 (Stage 7c): Revoke confirmation modal */}
      {revokeModal.show && (
          <div className="dashboard-modal-overlay">
              <div className="dashboard-modal" style={{ maxWidth: '500px' }}>
                  <div className="dashboard-modal-header">
                      <h3>Revoke Reviewer Status</h3>
                      <p>Confirm revocation for {revokeModal.app.username}</p>
                  </div>

                  <div className="dashboard-modal-body">
                      <div style={{
                        padding: '12px 14px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#991b1b',
                        marginBottom: '16px',
                      }}>
                        <strong>Warning:</strong> This action will:
                        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                          <li>Flip the user's role back to <code>user</code></li>
                          <li>Remove all reviewer privileges</li>
                          <li>Leave historical assignments intact (audit trail preserved via <code>reviewer_snapshot</code>)</li>
                        </ul>
                      </div>

                      <div className="form-group">
                          <label className="form-label">Reason for Revocation (optional)</label>
                          <textarea
                            className="auth-input-field"
                            style={{ minHeight: '80px', padding: '12px' }}
                            value={revokeModal.reason}
                            onChange={(e) => setRevokeModal({ ...revokeModal, reason: e.target.value })}
                            placeholder="e.g., Repeated low-quality reviews, conflict of interest pattern, requested withdrawal…"
                            maxLength={500}
                          />
                      </div>

                      {revokeError && (
                          <div className="form-error" style={{ marginTop: '12px' }}>
                              {revokeError}
                          </div>
                      )}
                  </div>

                  <div className="dashboard-modal-footer">
                      <button
                        className="dashboard-modal-btn dashboard-modal-btn-secondary"
                        onClick={() => setRevokeModal({ show: false, app: null, reason: '' })}
                        disabled={isSubmitting}
                      >
                          Cancel
                      </button>
                      <button
                        className="dashboard-modal-btn dashboard-modal-btn-danger"
                        onClick={handleConfirmRevoke}
                        disabled={isSubmitting}
                      >
                          {isSubmitting ? 'Revoking…' : 'Confirm Revocation'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default ReviewerApplications;
