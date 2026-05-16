import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { corpusAPI } from '../../api/results';
import useAuth from '../../hooks/useAuth';
import Avatar from '../../components/Avatar';
import '../dashboard.css';

function CorpusManagement({ isEmbedded = false }) {
  const { user, logout, isAdmin } = useAuth();
  const [papers, setPapers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [paperToDelete, setPaperToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [totalPapers, setTotalPapers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [paperAuthor, setPaperAuthor] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const previousDebouncedSearchRef = useRef('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain'];
  const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt'];

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard');
      return;
    }

    const searchChanged = previousDebouncedSearchRef.current !== debouncedSearchQuery;
    if (searchChanged) {
      previousDebouncedSearchRef.current = debouncedSearchQuery;
      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }

    fetchPapers();
  }, [navigate, isAdmin, currentPage, itemsPerPage, debouncedSearchQuery]);

  const fetchPapers = async () => {
    if (initialLoading) {
      setInitialLoading(true);
    } else {
      setIsFetching(true);
    }

    try {
      const response = await corpusAPI.getAll(currentPage, itemsPerPage, debouncedSearchQuery);
      const papersData = response.data.papers || [];
      const pagination = response.data.pagination || {};
      const nextTotalPapers = pagination.total || 0;
      const nextTotalPages = pagination.pages || 0;
      const nextPage = pagination.page || currentPage;
      const nextLimit = pagination.limit || itemsPerPage;

      if (nextTotalPages > 0 && currentPage > nextTotalPages) {
        setCurrentPage(nextTotalPages);
        return;
      }
      if (nextTotalPages === 0 && currentPage !== 1) {
        setCurrentPage(1);
      }

      setPapers(papersData);
      setTotalPapers(nextTotalPapers);
      setTotalPages(nextTotalPages);

      if (nextPage !== currentPage) {
        setCurrentPage(nextPage);
      }
      if (nextLimit !== itemsPerPage) {
        setItemsPerPage(nextLimit);
      }
    } catch (err) {
      setError('Failed to load papers');
    } finally {
      setInitialLoading(false);
      setIsFetching(false);
    }
  };

  const handleDeleteClick = (paper) => {
    setPaperToDelete(paper);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!paperToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await corpusAPI.delete(paperToDelete.id);
      setShowDeleteModal(false);
      setPaperToDelete(null);
      fetchPapers();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setPaperToDelete(null);
  };

  const resetUploadState = () => {
    setShowUploadModal(false);
    setPendingFile(null);
    setPaperTitle('');
    setPaperAuthor('');
    setIsUploading(false);
  };

  const handleBrowseClick = () => {
    setError('');
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    e.target.value = '';

    if (!selectedFile) {
      return;
    }

    const fileName = selectedFile.name || '';
    const fileExt = fileName.includes('.') ? `.${fileName.split('.').pop().toLowerCase()}` : '';
    const isAllowedType = allowedTypes.includes(selectedFile.type) || allowedExtensions.includes(fileExt);
    if (!isAllowedType) {
      setError('Invalid file type. Please upload PDF, DOCX, DOC, or TXT files.');
      return;
    }

    setError('');
    setPendingFile(selectedFile);
    setPaperTitle(fileName.replace(/\.[^/.]+$/, '') || fileName);
    setPaperAuthor('');
    setShowUploadModal(true);
  };

  const handleUploadCancel = () => {
    if (isUploading) return;
    resetUploadState();
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!pendingFile || !paperTitle.trim() || isUploading) return;

    setIsUploading(true);
    setError('');

    try {
      await corpusAPI.upload(pendingFile, paperTitle.trim(), paperAuthor.trim());
      resetUploadState();
      fetchPapers();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
      setIsUploading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const hasEntries = totalPapers > 0;
  const startEntry = hasEntries ? ((currentPage - 1) * itemsPerPage) + 1 : 0;
  const endEntry = hasEntries ? Math.min(currentPage * itemsPerPage, totalPapers) : 0;

  const handleItemsPerPageChange = (e) => {
    const value = e.target.value;
    if (value === 'custom') {
      setShowCustomInput(true);
      setCustomValue(itemsPerPage.toString());
    } else {
      setShowCustomInput(false);
      setItemsPerPage(parseInt(value, 10));
      setCurrentPage(1);
    }
  };

  const handleCustomValueChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCustomValue(value);
    }
  };

  const handleCustomValueBlur = () => {
    let num = parseInt(customValue, 10);
    if (isNaN(num) || num < 1) {
      num = 1;
    } else if (num > 100) {
      num = 100;
    }
    setCustomValue(num.toString());
    setItemsPerPage(num);
    setCurrentPage(1);
  };

  const handleCustomKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCustomValueBlur();
    }
  };

  if (initialLoading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner"></div>
        <p>Loading corpus data...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Navbar */}
      {!isEmbedded && (
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
            <Link to="/dashboard" className="dashboard-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Admin Dashboard
            </Link>
            <Link to="/users" className="dashboard-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              User Management
            </Link>
            <Link to="/admin" className="dashboard-nav-link active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Corpus Management
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
            <Avatar
              name={user?.username || 'Admin'}
              src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:5000${user.avatar_url}`) : undefined}
              className="dashboard-avatar"
              onClick={() => setShowUserMenu(!showUserMenu)}
            />
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
      )}

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Page Header */}
        <section className="dashboard-welcome" style={{ display: 'block', marginBottom: '24px' }}>
          <h1 className="dashboard-welcome-title">Corpus Management</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginTop: '8px' }}>
            <p className="dashboard-welcome-subtitle" style={{ marginBottom: 0, flex: 1 }}>
              Manage and monitor the document corpus used for plagiarism detection.
              View, search, and remove papers from the indexed collection.
            </p>
            <div className="dashboard-welcome-actions" style={{ marginTop: 0, flexShrink: 0 }}>
              <button className="dashboard-btn-primary" onClick={handleBrowseClick} disabled={isUploading}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Upload New Paper
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="dashboard-error-banner">
            {error}
            <button onClick={() => setError('')}>&times;</button>
          </div>
        )}

        {/* Papers Table */}
        <section className="dashboard-reports">
          <div className="dashboard-reports-header">
            <div>
              <h2>Indexed Papers</h2>
              <p className="dashboard-reports-subtitle">{totalPapers} papers in corpus</p>
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
            </div>
          </div>

          {papers.length === 0 ? (
            <div className="dashboard-empty">
              <svg className="dashboard-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              <h3>{debouncedSearchQuery ? 'No matching papers' : 'No papers in corpus'}</h3>
              <p>{debouncedSearchQuery ? 'Try adjusting your search query' : 'Papers will appear here once added to the corpus'}</p>
            </div>
          ) : (
            <>
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th style={{ width: '8%' }}>ID</th>
                    <th style={{ width: '37%' }}>Paper Title</th>
                    <th style={{ width: '20%' }}>Author</th>
                    <th style={{ width: '20%' }}>Date Added</th>
                    <th style={{ width: '15%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((paper) => (
                    <tr key={paper.id}>
                      <td style={{ color: '#6b7280', fontWeight: 500 }}>#{paper.id}</td>
                      <td>
                        <div className="dashboard-doc-cell">
                          <div className="dashboard-doc-icon-small">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                          </div>
                          <div className="dashboard-doc-info">
                            <span className="dashboard-doc-name" title={paper.title || paper.filename}>
                              {paper.title || paper.filename}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: '#374151' }} title={paper.author || 'Unknown'}>
                        <div style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          maxWidth: '100%'
                        }}>
                          {paper.author || 'Unknown'}
                        </div>
                      </td>
                      <td className="dashboard-date-cell" title={formatDate(paper.uploaded_at)}>
                        {formatDate(paper.uploaded_at)}
                      </td>
                      <td>
                        <button
                          className="dashboard-delete-btn"
                          onClick={() => handleDeleteClick(paper)}
                          title="Delete paper"
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
                  ))}
                </tbody>
              </table>

              <div className="dashboard-pagination">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="dashboard-pagination-info">
                    Showing {startEntry} to {endEntry} of {totalPapers} entries
                  </span>
                  {isFetching && (
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>Updating...</span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>Show</span>
                    {showCustomInput ? (
                      <input
                        type="text"
                        value={customValue}
                        onChange={handleCustomValueChange}
                        onBlur={handleCustomValueBlur}
                        onKeyDown={handleCustomKeyDown}
                        autoFocus
                        style={{
                          width: '60px',
                          padding: '6px 10px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          outline: 'none',
                          textAlign: 'center'
                        }}
                      />
                    ) : (
                      <select
                        value={itemsPerPage}
                        onChange={handleItemsPerPageChange}
                        style={{
                          padding: '6px 28px 6px 10px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          outline: 'none',
                          background: '#fff',
                          cursor: 'pointer',
                          appearance: 'none',
                          backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 8px top 50%',
                          backgroundSize: '10px auto'
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value="custom">Custom</option>
                      </select>
                    )}
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>entries</span>
                  </div>
                </div>
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
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="dashboard-modal-overlay">
          <div className="dashboard-modal">
            <div className="dashboard-modal-header">
              <h3 className="danger-text">Delete Paper</h3>
              <p>Are you sure you want to remove this paper from the corpus?</p>
            </div>
            <div className="dashboard-modal-body">
              <div className="delete-warning-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p>
                  <strong>Warning:</strong> This action cannot be undone. The paper
                  "<em>{paperToDelete?.title || paperToDelete?.filename}</em>" will be permanently
                  removed from the corpus and will no longer be used for plagiarism detection comparisons.
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
                Keep Paper
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

      {/* Upload Metadata Modal */}
      {showUploadModal && (
        <div className="dashboard-modal-overlay">
          <div className="dashboard-modal">
            <div className="dashboard-modal-header">
              <h3>Upload Paper to Corpus</h3>
              <p>Review metadata before adding this paper to the indexed corpus</p>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="dashboard-modal-body">
                <div className="dashboard-form-group">
                  <label htmlFor="corpus-title">Paper Title</label>
                  <input
                    id="corpus-title"
                    type="text"
                    className="dashboard-modal-input"
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                    placeholder="Enter paper title"
                    autoFocus
                    required
                  />
                </div>
                <div className="dashboard-form-group">
                  <label htmlFor="corpus-author">Author</label>
                  <input
                    id="corpus-author"
                    type="text"
                    className="dashboard-modal-input"
                    value={paperAuthor}
                    onChange={(e) => setPaperAuthor(e.target.value)}
                    placeholder="Enter author name (optional)"
                  />
                </div>
              </div>
              <div className="dashboard-modal-footer">
                <button
                  type="button"
                  className="dashboard-modal-btn dashboard-modal-btn-secondary"
                  onClick={handleUploadCancel}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dashboard-modal-btn dashboard-modal-btn-primary"
                  disabled={isUploading || !paperTitle.trim()}
                >
                  {isUploading ? 'Uploading...' : 'Upload to Corpus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CorpusManagement;
