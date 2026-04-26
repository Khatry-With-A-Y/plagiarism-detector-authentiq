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
      const relevant = (res.data.notifications || []).filter(n =>
        n.title.toLowerCase().includes('reviewer application') ||
        n.title.toLowerCase().includes('application')
      );
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
    } catch (err) {
      alert("Error submitting decision: " + (err.response?.data?.error || err.message));
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
                    <span className={`dashboard-risk-badge ${app.application_status === 'approved' ? 'low' : app.application_status === 'pending' ? 'medium' : 'high'}`}>
                        {app.application_status.toUpperCase()}
                    </span>
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
                                    style={{ color: '#059669', borderColor: '#10b981', padding: '6px 12px' }}
                                    onClick={() => handleDecisionClick(app, 'approved')}
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
    </div>
  );
}

export default ReviewerApplications;
