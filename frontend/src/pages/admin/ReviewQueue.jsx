import React, { useState, useEffect } from 'react';
import reviewsAPI from '../../api/reviews';
import '../dashboard.css';

function ReviewQueue() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');

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
                       <button className="dashboard-view-link">
                         {req.review_status === 'pending' ? 'Assign Reviewers' : 'View Details'}
                       </button>
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
    </div>
  );
}

export default ReviewQueue;
