import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { submissionsAPI } from '../../api/results';
import useAuth from '../../hooks/useAuth';
import '../dashboard.css';

function UserDashboard() {
  const { user, logout, isAdmin } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [submissionToDelete, setSubmissionToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchSubmissions();

    // Set up polling for pending/processing submissions
    const pollInterval = setInterval(() => {
      const hasProcessing = submissions.some(s => s.status === 'pending' || s.status === 'processing');
      if (hasProcessing) {
        fetchSubmissions();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [navigate, user, submissions.length, submissions.some(s => s.status === 'pending' || s.status === 'processing')]);

  const fetchSubmissions = async () => {
    try {
      const response = await submissionsAPI.getAll();
      setSubmissions(response.data.submissions || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (file) => {
    if (!file) return;

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Please upload PDF, DOCX, DOC, or TXT files.');
      return;
    }

    setUploadError('');
    setPendingFile(file);
    setNewFilename(file.name);
    setShowRenameModal(true);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!newFilename.trim() || isUploading || !pendingFile) return;

    setIsUploading(true);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('filename', newFilename.trim());
      
      await submissionsAPI.upload(formData);
      
      setShowRenameModal(false);
      setPendingFile(null);
      fetchSubmissions();
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploading(false);
    }
  };

  const handleRenameCancel = () => {
    setShowRenameModal(false);
    setPendingFile(null);
    setNewFilename('');
  };

  const handleDeleteClick = (submission) => {
    setSubmissionToDelete(submission);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!submissionToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await submissionsAPI.delete(submissionToDelete.id);
      setShowDeleteModal(false);
      setSubmissionToDelete(null);
      fetchSubmissions();
    } catch (err) {
      console.error('Delete failed:', err);
      setUploadError('Failed to delete submission. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setSubmissionToDelete(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    handleFileUpload(file);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleViewReport = (submissionId) => {
    navigate(`/results/${submissionId}`);
  };

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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  // Calculate stats
  const totalReports = submissions.length;
  const completedSubmissions = submissions.filter(s => s.status === 'completed' && s.similarity_score !== undefined);
  const averageSimilarity = completedSubmissions.length > 0
    ? (completedSubmissions.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / completedSubmissions.length).toFixed(1)
    : 0;
  const highRiskAlerts = completedSubmissions.filter(s => (s.similarity_score || 0) >= 40).length;

  // Calculate time-based stats for trends
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setMilliseconds(-1);

  // Reports this month vs last month
  const reportsThisMonth = submissions.filter(s => new Date(s.uploaded_at) >= thisMonthStart).length;
  const reportsLastMonth = submissions.filter(s => {
    const date = new Date(s.uploaded_at);
    return date >= lastMonthStart && date <= lastMonthEnd;
  }).length;
  const reportsChange = reportsLastMonth > 0
    ? (((reportsThisMonth - reportsLastMonth) / reportsLastMonth) * 100).toFixed(0)
    : reportsThisMonth > 0 ? 100 : 0;

  // Average similarity this month vs last month
  const completedThisMonth = completedSubmissions.filter(s => new Date(s.uploaded_at) >= thisMonthStart);
  const completedLastMonth = completedSubmissions.filter(s => {
    const date = new Date(s.uploaded_at);
    return date >= lastMonthStart && date <= lastMonthEnd;
  });
  const avgThisMonth = completedThisMonth.length > 0
    ? completedThisMonth.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / completedThisMonth.length
    : 0;
  const avgLastMonth = completedLastMonth.length > 0
    ? completedLastMonth.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / completedLastMonth.length
    : 0;
  const avgChange = (avgThisMonth - avgLastMonth).toFixed(1);

  // High risk alerts this week
  const highRiskThisWeek = completedSubmissions.filter(s =>
    new Date(s.uploaded_at) >= thisWeekStart && (s.similarity_score || 0) >= 40
  ).length;
  const highRiskLastWeek = completedSubmissions.filter(s => {
    const date = new Date(s.uploaded_at);
    return date >= lastWeekStart && date < thisWeekStart && (s.similarity_score || 0) >= 40;
  }).length;
  const highRiskChange = highRiskThisWeek - highRiskLastWeek;

  // Filter and paginate submissions
  const filteredSubmissions = submissions.filter(s =>
    s.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage);
  const paginatedSubmissions = filteredSubmissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get top similarities for chart
  const topSimilarities = [...completedSubmissions]
    .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
    .slice(0, 2);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Navbar */}
      <nav className="dashboard-navbar">
        <div className="dashboard-navbar-left">
          <Link to="/" className="dashboard-logo">
            <svg className="dashboard-logo-icon" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2"/>
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="dashboard-logo-text">Authentiq</span>
          </Link>
          <div className="dashboard-nav-links">
            <Link to="/dashboard" className="dashboard-nav-link active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Dashboard
            </Link>
            <Link to="/my-statistics" className="dashboard-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              User Statistics
            </Link>
          </div>
        </div>
        <div className="dashboard-navbar-right">
          <button className="dashboard-icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
          <div className="dashboard-user-menu">
            <div className="dashboard-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
              <img src="https://ui-avatars.com/api/?name=User&background=1e40af&color=fff" alt="User" />
            </div>
            {showUserMenu && (
              <div className="dashboard-dropdown">
                <button className="dashboard-dropdown-item" onClick={() => navigate('/profile')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profile
                </button>
                <button className="dashboard-dropdown-item danger" onClick={handleLogout}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Welcome Section */}
        <section className="dashboard-welcome">
          <div className="dashboard-welcome-left">
            <h1 className="dashboard-welcome-title">Welcome to Authentiq, {user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : ''}!</h1>
            <p className="dashboard-welcome-subtitle">
              Maintain the highest standards of academic integrity. Upload your documents
              for a comprehensive scan against millions of sources and receive detailed
              originality reports in seconds.
            </p>
            <div className="dashboard-welcome-actions">
              <button className="dashboard-btn-primary" onClick={handleBrowseClick}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Upload New Paper
              </button>
              <button className="dashboard-btn-outline">
                Learn How it Works
              </button>
            </div>
          </div>
          <div
            className={`dashboard-upload-zone ${dragOver ? 'dragover' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBrowseClick}
          >
            {uploading ? (
              <div className="dashboard-upload-zone-content">
                <div className="dashboard-spinner" style={{ width: '32px', height: '32px' }}></div>
                <h3>Uploading...</h3>
              </div>
            ) : (
              <div className="dashboard-upload-zone-content">
                <div className="dashboard-upload-zone-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="12" y2="12"/>
                    <line x1="15" y1="15" x2="12" y2="12"/>
                  </svg>
                </div>
                <h3>Ready to scan?</h3>
                <p>Drag and drop files here to start a new analysis</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        </section>

        {uploadError && (
          <div className="dashboard-error-banner">
            {uploadError}
            <button onClick={() => setUploadError('')}>&times;</button>
          </div>
        )}

        {/* Stats Cards */}
        <section className="dashboard-stats">
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">Total Reports</p>
              <h3 className="dashboard-stat-value">{totalReports}</h3>
              <p className={`dashboard-stat-trend ${Number(reportsChange) >= 0 ? 'positive' : 'negative'}`}>
                {Number(reportsChange) >= 0 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                  </svg>
                )}
                {Number(reportsChange) >= 0 ? '+' : ''}{reportsChange}% from last month
              </p>
            </div>
            <div className="dashboard-stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">Average Similarity</p>
              <h3 className="dashboard-stat-value">{averageSimilarity}%</h3>
              <p className={`dashboard-stat-trend ${Number(avgChange) <= 0 ? 'positive' : 'negative'}`}>
                {Number(avgChange) <= 0 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  </svg>
                )}
                {Number(avgChange) > 0 ? '↑' : Number(avgChange) < 0 ? '↓' : ''} {Math.abs(Number(avgChange))}% from last month
              </p>
            </div>
            <div className="dashboard-stat-icon gray">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">High Risk Alerts</p>
              <h3 className="dashboard-stat-value">{highRiskAlerts}</h3>
              <p className={`dashboard-stat-trend ${highRiskChange <= 0 ? 'positive' : 'negative'}`}>
                {highRiskChange <= 0 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  </svg>
                )}
                {highRiskChange > 0 ? `↑ ${highRiskChange} new` : highRiskChange < 0 ? `↓ ${Math.abs(highRiskChange)} less` : 'No change'} this week
              </p>
            </div>
            <div className="dashboard-stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
              </svg>
            </div>
          </div>
        </section>

        {/* Recent Reports Table */}
        <section className="dashboard-reports">
          <div className="dashboard-reports-header">
            <div>
              <h2>Recent Reports</h2>
              <p className="dashboard-reports-subtitle">Manage and view your document history</p>
            </div>
            <div className="dashboard-reports-actions">
              <div className="dashboard-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search papers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="dashboard-filter-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
              </button>
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="dashboard-empty">
              <svg className="dashboard-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <h3>No reports yet</h3>
              <p>Upload your first document to get started!</p>
            </div>
          ) : (
            <>
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Scan Date</th>
                    <th>Similarity %</th>
                    <th>Risk Assessment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSubmissions.map((submission) => {
                    const similarity = submission.similarity_score || 0;
                    const riskLevel = getRiskLevel(similarity);
                    return (
                      <tr key={submission.id}>
                        <td>
                          <div className="dashboard-doc-cell">
                            <div className="dashboard-doc-icon-small">
                              <svg viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                            <div className="dashboard-doc-info">
                              <span className="dashboard-doc-name" title={submission.filename}>{submission.filename}</span>
                              <span className="dashboard-doc-size">{formatFileSize(submission.file_size || 1200000)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="dashboard-date-cell">{formatDate(submission.uploaded_at)}</td>
                        <td>
                          {submission.status === 'completed' ? (
                            <span className={`dashboard-similarity ${riskLevel}`}>
                              {similarity.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="dashboard-similarity pending">{submission.status}</span>
                          )}
                        </td>
                        <td>
                          {submission.status === 'completed' ? (
                            <span className={`dashboard-risk-badge ${riskLevel}`}>
                              {getRiskLabel(similarity)}
                            </span>
                          ) : (
                            <span className="dashboard-risk-badge pending">Pending</span>
                          )}
                        </td>
                        <td className="dashboard-actions-cell">
                          <button
                            className="dashboard-view-link"
                            onClick={() => handleViewReport(submission.id)}
                          >
                            View Report
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                              <polyline points="15 3 21 3 21 9"/>
                              <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </button>
                          <button
                            className="dashboard-delete-btn"
                            onClick={() => handleDeleteClick(submission)}
                            title="Delete submission"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="dashboard-pagination">
                <span className="dashboard-pagination-info">
                  Showing {paginatedSubmissions.length} of {filteredSubmissions.length} reports
                </span>
                <div className="dashboard-pagination-btns">
                  <button
                    className="dashboard-pagination-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="dashboard-pagination-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Bottom Section */}
        <section className="dashboard-bottom">
          <div className="dashboard-tip-card">
            <div className="dashboard-tip-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div className="dashboard-tip-content">
              <h3>Tip of the Day</h3>
              <p className="dashboard-tip-subtitle">Improve your academic writing</p>
              <p className="dashboard-tip-text">
                Remember that proper citation is not just about avoiding plagiarism; it's about
                giving credit to the ideas that helped shape your work. Always double-check
                your APA/MLA formatting before the final submission.
              </p>
              <a href="#" className="dashboard-tip-link">
                View Full Tip
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="dashboard-chart-card">
            <h3>Highest Similarities Detected</h3>
            <p className="dashboard-chart-subtitle">Track your highest risk academic projects</p>
            {topSimilarities.length === 0 ? (
              <div className="dashboard-empty-small">
                <p>No completed scans yet</p>
              </div>
            ) : (
              <div className="dashboard-chart">
                {topSimilarities.map((submission) => {
                  const similarity = submission.similarity_score || 0;
                  const riskLevel = getRiskLevel(similarity);
                  return (
                    <div key={submission.id} className="dashboard-chart-row">
                      <span className="dashboard-chart-label" title={submission.filename}>
                        {submission.filename}
                      </span>
                      <div className="dashboard-chart-bar-wrapper">
                        <div className="dashboard-chart-track">
                          <div
                            className={`dashboard-chart-fill ${riskLevel}`}
                            style={{ width: `${Math.min(similarity, 100)}%` }}
                          ></div>
                        </div>
                        <span className="dashboard-chart-value">{similarity.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p className="dashboard-footer-copyright">© 2026 Authentiq Plagiarism Detection. All rights reserved.</p>
        <div className="dashboard-footer-links">
          <a href="#" className="dashboard-footer-link">Privacy Policy</a>
          <a href="#" className="dashboard-footer-link">Terms of Service</a>
          <a href="#" className="dashboard-footer-link">Contact Support</a>
        </div>
      </footer>

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="dashboard-modal-overlay">
          <div className="dashboard-modal">
            <div className="dashboard-modal-header">
              <h3>Name your file</h3>
              <p>Give this submission a name for easier tracking</p>
            </div>
            <form onSubmit={handleRenameSubmit}>
              <div className="dashboard-modal-body">
                <div className="dashboard-form-group">
                  <label htmlFor="filename">File Name</label>
                  <input
                    type="text"
                    id="filename"
                    className="dashboard-modal-input"
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                    placeholder="Enter file name"
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="dashboard-modal-footer">
                <button 
                  type="button" 
                  className="dashboard-modal-btn dashboard-modal-btn-secondary" 
                  onClick={handleRenameCancel}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="dashboard-modal-btn dashboard-modal-btn-primary"
                  disabled={isUploading || !newFilename.trim()}
                >
                  {isUploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="dashboard-modal-overlay">
          <div className="dashboard-modal">
            <div className="dashboard-modal-header">
              <h3 className="danger-text">Delete Submission</h3>
              <p>Are you sure you want to delete this file?</p>
            </div>
            <div className="dashboard-modal-body">
              <div className="delete-warning-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p>
                  <strong>Warning:</strong> This action cannot be undone. All data and analysis results associated with 
                  "<em>{submissionToDelete?.filename}</em>" will be permanently removed from our servers. 
                  We are not liable for any loss of information resulting from this action.
                </p>
              </div>
            </div>
            <div className="dashboard-modal-footer">
              <button 
                type="button" 
                className="dashboard-modal-btn dashboard-modal-btn-secondary" 
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Keep File
              </button>
              <button 
                type="button" 
                className="dashboard-modal-btn dashboard-modal-btn-danger"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserDashboard;
