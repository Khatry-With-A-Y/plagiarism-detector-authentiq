import React from 'react';
import useFetchResults from '../hooks/useFetchResults';
import ResultCard from '../components/ResultCard';

function ResultsDisplay({ submissionId }) {
  const { results, submission, loading, error, refresh } = useFetchResults(submissionId);

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
        <button className="btn btn-primary" onClick={refresh} style={{ marginTop: '10px' }}>
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
