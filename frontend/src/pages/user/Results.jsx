import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useFetchResults from '../../hooks/useFetchResults';
import '../dashboard.css';

function Results({ id: propId, isEmbedded }) {
  const { id: paramId } = useParams();
  const id = propId || paramId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { results, submission, loading, error, refresh } = useFetchResults(id);

  const getRiskLevel = (similarity) => {
    if (similarity < 15) return 'low';
    if (similarity < 40) return 'medium';
    return 'high';
  };

  const getRiskLabel = (similarity) => {
    if (similarity < 15) return 'Low Risk';
    if (similarity < 40) return 'Medium Risk';
    return 'High Risk';
  };

  const getUserInitials = () => {
    if (!user?.username) return 'U';
    return user.username.charAt(0).toUpperCase();
  };

  // Calculate overall similarity (max)
  const maxSimilarity = results.length > 0
    ? Math.max(...results.map(r => r.similarity_score * 100))
    : 0;

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
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#1a1a2e' }}>
                    {maxSimilarity.toFixed(1)}%
                  </div>
                  <span className={`dashboard-risk-badge ${getRiskLevel(maxSimilarity)}`}>
                    {getRiskLabel(maxSimilarity)}
                  </span>
                </div>
              </div>
            </div>

            {/* Results Table */}
            <div className="dashboard-reports">
              <div className="dashboard-reports-header">
                <h2>Similarity Matches</h2>
                <span style={{ fontSize: '14px', color: '#64748b' }}>
                  {results.length} document{results.length !== 1 ? 's' : ''} compared
                </span>
              </div>

              {results.length === 0 ? (
                <div className="dashboard-empty">
                  <svg className="dashboard-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
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
                      <th>Rank</th>
                      <th>Source Document</th>
                      <th>Author</th>
                      <th>Similarity %</th>
                      <th>Risk Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => {
                      const similarity = result.similarity_score * 100;
                      const riskLevel = getRiskLevel(similarity);
                      return (
                        <tr key={result.paper_id}>
                          <td style={{ fontWeight: '600', color: '#1e40af' }}>#{index + 1}</td>
                          <td>
                            <div className="dashboard-doc-name">
                              <div className="dashboard-doc-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                  <polyline points="14 2 14 8 20 8"/>
                                </svg>
                              </div>
                              <div>
                                <span style={{ fontWeight: '500' }}>{result.title}</span>
                                <br />
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{result.filename}</span>
                              </div>
                            </div>
                          </td>
                          <td>{result.author}</td>
                          <td>
                            <span className={`dashboard-similarity ${riskLevel}`}>
                              {similarity.toFixed(2)}%
                            </span>
                          </td>
                          <td>
                            <span className={`dashboard-risk-badge ${riskLevel}`}>
                              {getRiskLabel(similarity)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Summary Section */}
            <div className="dashboard-bottom">
              <div className="dashboard-tip-card">
                <div className="dashboard-tip-header">
                  <div className="dashboard-tip-icon" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                  </div>
                  <h3>Analysis Summary</h3>
                </div>
                <p className="dashboard-tip-content">
                  {maxSimilarity < 15
                    ? "Great job! Your document shows minimal similarity with sources in our database. This indicates strong originality."
                    : maxSimilarity < 40
                    ? "Your document has some similarity with existing sources. Review the matched sections and ensure proper citations are in place."
                    : "High similarity detected! Please carefully review the matched content and consider revising sections that may require proper attribution."}
                </p>
              </div>
              <div className="dashboard-chart-card">
                <h3>Top 5 Matches</h3>
                {results.length === 0 ? (
                  <div className="dashboard-empty">
                    <p>No matches to display</p>
                  </div>
                ) : (
                  <div className="dashboard-chart">
                    {results.slice(0, 5).map((result) => {
                      const similarity = result.similarity_score * 100;
                      const riskLevel = getRiskLevel(similarity);
                      return (
                        <div key={result.paper_id} className="dashboard-chart-bar">
                          <span className="dashboard-chart-label" title={result.title}>
                            {result.title.length > 12
                              ? result.title.substring(0, 12) + '...'
                              : result.title}
                          </span>
                          <div className="dashboard-chart-track">
                            <div
                              className={`dashboard-chart-fill ${riskLevel}`}
                              style={{ width: `${Math.min(similarity, 100)}%` }}
                            ></div>
                          </div>
                          <span className="dashboard-chart-value">{similarity.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p className="dashboard-footer-copyright">© 2024 Authentiq. All rights reserved.</p>
        <div className="dashboard-footer-links">
          <a href="#" className="dashboard-footer-link">Help Center</a>
          <a href="#" className="dashboard-footer-link">Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
}

export default Results;
