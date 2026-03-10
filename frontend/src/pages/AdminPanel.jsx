import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { corpusAPI } from '../api/results';
import useAuth from '../hooks/useAuth';

function AdminPanel() {
  const { user, logout, isAdmin } = useAuth();
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
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

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      await corpusAPI.upload(file, title, author);
      setSuccess('Paper added to corpus successfully!');
      setFile(null);
      setTitle('');
      setAuthor('');
      e.target.reset();
      fetchPapers();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
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
          <p>Welcome, {user?.username}!</p>
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

      <div className="card" style={{ marginBottom: '30px' }}>
        <h3>Add Paper to Corpus</h3>
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label>Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Paper title"
            />
          </div>
          <div className="form-group">
            <label>Author (optional)</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
            />
          </div>
          <div className="form-group">
            <label>File (.txt, .pdf, .doc, .docx - Max 10MB)</label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".txt,.pdf,.doc,.docx"
              required
              disabled={uploading}
            />
          </div>
          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading || !file}
          >
            {uploading ? 'Uploading...' : 'Add to Corpus'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Corpus Papers ({papers.length})</h3>
        {loading ? (
          <p>Loading...</p>
        ) : papers.length === 0 ? (
          <p>No papers in corpus yet. Add papers using the form above.</p>
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
