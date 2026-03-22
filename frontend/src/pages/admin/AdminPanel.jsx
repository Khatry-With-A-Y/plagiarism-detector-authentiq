import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { corpusAPI } from '../../api/results';
import useAuth from '../../hooks/useAuth';

function AdminPanel() {
  const { user, logout, isAdmin } = useAuth();
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard');
      return;
    }
    fetchPapers();
  }, [navigate, isAdmin]);

  const fetchPapers = async () => {
    try {
      const response = await corpusAPI.getAll();
      setPapers(response.data.papers || []);
    } catch (err) {
      setError('Failed to load papers');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (paperId) => {
    if (!window.confirm('Are you sure you want to delete this paper from the corpus?')) {
      return;
    }

    try {
      await corpusAPI.delete(paperId);
      setSuccess('Paper deleted successfully!');
      fetchPapers();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1>Admin Panel - Corpus Management</h1>
          <p>Welcome, {user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : ''}!</p>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/dashboard')}
            style={{ marginRight: '10px' }}
          >
            Back to Dashboard
          </button>
          <button className="btn btn-secondary" onClick={() => { logout(); navigate('/login'); }}>
            Logout
          </button>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: '20px' }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: '20px' }}>{success}</div>}

      <div className="card">
        <h3>Corpus Papers ({papers.length})</h3>
        {loading ? (
          <p>Loading...</p>
        ) : papers.length === 0 ? (
          <p>No papers in corpus yet. Add papers from the Dashboard.</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px', marginTop: '20px' }}>
            {papers.map((paper) => (
              <div
                key={paper.id}
                style={{
                  padding: '15px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{paper.title || paper.filename}</strong>
                  <p style={{ color: '#666', marginTop: '5px', fontSize: '14px' }}>
                    Author: {paper.author || 'Unknown'} | 
                    Added: {new Date(paper.uploaded_at).toLocaleString()}
                  </p>
                </div>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(paper.id)}
                  style={{ marginLeft: '10px' }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
