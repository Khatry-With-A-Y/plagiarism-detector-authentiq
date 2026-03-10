import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionsAPI } from '../api/results';
import useAuth from '../hooks/useAuth';
import FileUpload from './FileUpload';
import ResultsDisplay from './ResultsDisplay';

function Dashboard() {
  const { user, logout, isAdmin } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchSubmissions();
  }, [navigate, user]);

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

  const handleUploadSuccess = (submission) => {
    fetchSubmissions();
    setSelectedSubmission(submission.id);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1>Authentiq - Plagiarism Detector</h1>
          <p>Welcome, {user?.username}!</p>
        </div>
        <div>
          {isAdmin && (
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/admin')}
              style={{ marginRight: '10px' }}
            >
              Admin Panel
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <FileUpload onUploadSuccess={handleUploadSuccess} />

      <div style={{ marginTop: '30px' }}>
        <h2>Your Submissions</h2>
        {submissions.length === 0 ? (
          <div className="card">
            <p>No submissions yet. Upload a file to get started!</p>
          </div>
        ) : (
          <div>
            <div className="card" style={{ marginBottom: '20px' }}>
              <h3>Submission History</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {submissions.map((submission) => (
                  <div
                    key={submission.id}
                    style={{
                      padding: '15px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: selectedSubmission === submission.id ? '#f0f0f0' : 'white',
                    }}
                    onClick={() => setSelectedSubmission(submission.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{submission.filename}</strong>
                        <p style={{ color: '#666', marginTop: '5px', fontSize: '14px' }}>
                          Uploaded: {new Date(submission.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span
                          style={{
                            padding: '5px 10px',
                            borderRadius: '4px',
                            backgroundColor:
                              submission.status === 'completed'
                                ? '#28a745'
                                : submission.status === 'processing'
                                ? '#ffc107'
                                : '#6c757d',
                            color: 'white',
                            fontSize: '12px',
                          }}
                        >
                          {submission.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedSubmission && (
              <ResultsDisplay submissionId={selectedSubmission} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
