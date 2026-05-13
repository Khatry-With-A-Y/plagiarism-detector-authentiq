import React, { useState } from 'react';
import {
  calculateRiskLevel,
  getRiskTextColor,
  RISK_PROFILES,
  SCORE_INPUT_SCALES,
} from '../utils/riskAssessment';

function ResultCard({ result, rank }) {
  const [expanded, setExpanded] = useState(false);
  const similarityPercent = (result.similarity_score * 100).toFixed(1);
  const matchDetails = result.match_details || {};
  const highestMatchScore = matchDetails.highest_match_score || 0;
  const highestMatchPercent = (highestMatchScore * 100).toFixed(1);
  const submitterRiskOptions = {
    inputScale: SCORE_INPUT_SCALES.RATIO,
    profile: RISK_PROFILES.SUBMITTER,
  };

  // Use standardized risk assessment
  const similarityRisk = calculateRiskLevel(result.similarity_score, null, submitterRiskOptions);
  const highestMatchRisk = calculateRiskLevel(highestMatchScore, null, submitterRiskOptions);

  const getSimilarityColor = () => getRiskTextColor(similarityRisk);
  const getHighestMatchColor = () => getRiskTextColor(highestMatchRisk);

  // Use standardized high risk threshold (40%)
  const isHighRisk = (highestMatchScore * 100) >= 40;

  return (
    <div className="card" style={{ borderLeft: `4px solid ${getSimilarityColor()}`, position: 'relative' }}>
      {isHighRisk && (
        <div style={{
          backgroundColor: '#ffdddd',
          color: '#d8000c',
          padding: '8px 12px',
          borderRadius: '4px',
          marginBottom: '10px',
          fontWeight: 'bold',
          border: '1px solid #d8000c'
        }}>
          ⚠️ Warning: High confidence exact text matches found ({highestMatchPercent}%)
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ marginBottom: '10px' }}>
            #{rank} - {result.title || result.filename}
          </h4>
          <p style={{ color: '#666', marginBottom: '5px' }}>
            <strong>Author:</strong> {result.author || 'Unknown'}
          </p>
          <p style={{ color: '#666', marginBottom: '10px' }}>
            <strong>Overall Similarity:</strong>{' '}
            <span style={{ color: getSimilarityColor(), fontWeight: 'bold' }}>
              {similarityPercent}%
            </span>
            {highestMatchScore > 0 && (
              <span style={{ marginLeft: '15px' }}>
                <strong>Highest Exact Match:</strong>{' '}
                <span style={{ color: getHighestMatchColor(), fontWeight: 'bold' }}>
                  {highestMatchPercent}%
                </span>
              </span>
            )}
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
                  backgroundColor: getSimilarityColor(),
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
