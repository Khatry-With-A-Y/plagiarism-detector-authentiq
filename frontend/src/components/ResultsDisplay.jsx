import React, { useState, useEffect } from 'react';
import { submissionsAPI } from '../services/api';
import ResultCard from './ResultCard';

function ResultsDisplay({ submissionId }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    if (submissionId) {
      fetchResults();
    }
  }, [submissionId]);

  const fetchResults = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await submissionsAPI.getResults(submissionId);
      setSubmission(response.data);
      setResults(response.data.results || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p>Loading results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!submission || results.length === 0) {
    return (
      <div className="card">
        <p>No results available yet. The analysis may still be processing.</p>
        <button className="btn btn-primary" onClick={fetchResults} style={{ marginTop: '10px' }}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Analysis Results</h3>
        <p><strong>File:</strong> {submission.filename}</p>
        <p><strong>Status:</strong> {submission.status}</p>
        <p><strong>Total Matches:</strong> {results.length}</p>
      </div>

      <div>
        <h3 style={{ marginBottom: '15px' }}>Similarity Rankings</h3>
        {results.map((result, index) => (
          <ResultCard key={result.paper_id} result={result} rank={index + 1} />
        ))}
      </div>
    </div>
  );
}

export default ResultsDisplay;
