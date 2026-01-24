import React, { useState } from 'react';

function ResultCard({ result, rank }) {
  const [expanded, setExpanded] = useState(false);
  const similarityPercent = (result.similarity_score * 100).toFixed(2);

  const getScoreColor = (score) => {
    if (score >= 0.7) return '#dc3545'; // High similarity - red
    if (score >= 0.4) return '#ffc107'; // Medium similarity - yellow
    return '#28a745'; // Low similarity - green
  };

  return (
    <div className="card" style={{ borderLeft: `4px solid ${getScoreColor(result.similarity_score)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ marginBottom: '10px' }}>
            #{rank} - {result.title || result.filename}
          </h4>
          <p style={{ color: '#666', marginBottom: '5px' }}>
            <strong>Author:</strong> {result.author || 'Unknown'}
          </p>
          <p style={{ color: '#666', marginBottom: '10px' }}>
            <strong>Similarity:</strong>{' '}
            <span style={{ color: getScoreColor(result.similarity_score), fontWeight: 'bold' }}>
              {similarityPercent}%
            </span>
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => setExpanded(!expanded)}
          style={{ marginLeft: '10px' }}
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #ddd' }}>
          <p><strong>Filename:</strong> {result.filename}</p>
          <p><strong>Paper ID:</strong> {result.paper_id}</p>
          <div style={{ marginTop: '10px' }}>
            <div style={{ 
              width: '100%', 
              height: '20px', 
              backgroundColor: '#e9ecef', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div
                style={{
                  width: `${similarityPercent}%`,
                  height: '100%',
                  backgroundColor: getScoreColor(result.similarity_score),
                  transition: 'width 0.3s'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultCard;
