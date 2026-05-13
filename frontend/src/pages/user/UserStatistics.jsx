import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submissionsAPI } from '../../api/results';
import useAuth from '../../hooks/useAuth';
import Avatar from '../../components/Avatar';
import {
  calculateRiskLevel,
  getRiskLabel,
  RISK_PROFILES,
  SCORE_INPUT_SCALES,
} from '../../utils/riskAssessment';
import './userStatistics.css';

function UserStatistics({ isEmbedded = false }) {
  const { user, logout, isAdmin } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [submissions, setSubmissions] = useState([]);
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const statisticsRiskOptions = {
    inputScale: SCORE_INPUT_SCALES.PERCENT,
    profile: RISK_PROFILES.SUBMITTER,
  };

  // Calculate user statistics
  const completedSubmissions = submissions.filter(s => s.status === 'completed' && s.similarity_score !== undefined);
  const totalReports = submissions.length;

  // Reports this month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const reportsThisMonth = submissions.filter(s => new Date(s.uploaded_at) >= thisMonthStart).length;

  // Average similarity
  const averageSimilarity = completedSubmissions.length > 0
    ? (completedSubmissions.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / completedSubmissions.length)
    : 0;

  // High risk alerts (similarity >= 40%)
  const highRiskThreshold = 40;
  const highRiskAlerts = completedSubmissions.filter(s => (s.similarity_score || 0) >= highRiskThreshold).length;

  // Total words scanned (estimate based on file size or use actual if available)
  const totalWordsScanned = completedSubmissions.reduce((acc, s) => {
    // Estimate: ~500 words per KB for text documents
    const fileSize = s.file_size || 50000;
    return acc + Math.round(fileSize / 100);
  }, 0);

  // Get originality interpretation
  const getOriginalityMessage = (avg) => {
    if (avg < 15) return { text: "Excellent originality! Your submissions show minimal overlap.", type: "excellent" };
    if (avg < 30) return { text: "Good originality. Your submissions show low overlap on average.", type: "good" };
    if (avg < 50) return { text: "Moderate similarity detected. Consider reviewing flagged sections.", type: "moderate" };
    return { text: "High similarity detected. Please review your sources carefully.", type: "warning" };
  };

  const originalityMessage = getOriginalityMessage(averageSimilarity);

  // Get pages equivalent
  const getPagesEquivalent = (words) => {
    const pages = Math.round(words / 300);
    return pages;
  };

  // Recent activity (last 5)
  const recentActivity = [...submissions]
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    .slice(0, 5);

  // Calculate trend (compare this month vs last month average)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const thisMonthCompleted = completedSubmissions.filter(s => new Date(s.uploaded_at) >= thisMonthStart);
  const lastMonthCompleted = completedSubmissions.filter(s => {
    const date = new Date(s.uploaded_at);
    return date >= lastMonthStart && date <= lastMonthEnd;
  });

  const thisMonthAvg = thisMonthCompleted.length > 0
    ? thisMonthCompleted.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / thisMonthCompleted.length
    : 0;
  const lastMonthAvg = lastMonthCompleted.length > 0
    ? lastMonthCompleted.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / lastMonthCompleted.length
    : 0;

  const trendChange = lastMonthAvg > 0 ? (thisMonthAvg - lastMonthAvg) : 0;
  const trendImproving = trendChange < 0;

  // Mock top overlapping terms (would come from backend in real implementation)
  const topOverlappingTerms = [
    { term: 'methodology', count: 12 },
    { term: 'analysis', count: 9 },
    { term: 'research', count: 8 },
    { term: 'conclusion', count: 6 },
    { term: 'data processing', count: 5 },
  ];

  // Generate sparkline data for reports trend
  const generateSparklineData = () => {
    const months = 6;
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const count = submissions.filter(s => {
        const date = new Date(s.uploaded_at);
        return date >= monthStart && date <= monthEnd;
      }).length;
      data.push(count);
    }
    return data;
  };

  const sparklineData = generateSparklineData();
  const maxSparkline = Math.max(...sparklineData, 1);

  // Generate originality trend data
  const generateOriginalityTrend = () => {
    const months = 5;
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthSubmissions = completedSubmissions.filter(s => {
        const date = new Date(s.uploaded_at);
        return date >= monthStart && date <= monthEnd;
      });
      const avg = monthSubmissions.length > 0
        ? monthSubmissions.reduce((acc, s) => acc + (s.similarity_score || 0), 0) / monthSubmissions.length
        : null;
      data.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        value: avg
      });
    }
    return data;
  };

  const originalityTrendData = generateOriginalityTrend();

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="ustats-loading">
        <div className="ustats-spinner"></div>
        <p>Loading your statistics...</p>
      </div>
    );
  }

  return (
    <div className="user-statistics">
      {/* Navbar */}
      {!isEmbedded && (
      <nav className="ustats-navbar">
        <div className="ustats-navbar-left">
          <Link to="/" className="ustats-logo">
            <svg className="ustats-logo-icon" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2"/>
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="ustats-logo-text">Authentiq</span>
          </Link>
          <div className="ustats-nav-links">
            <Link to="/dashboard" className="ustats-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Dashboard
            </Link>
            <Link to="/my-statistics" className="ustats-nav-link active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              My Statistics
            </Link>
          </div>
        </div>
        <div className="ustats-navbar-right">
          {isAdmin && (
            <button
              className="ustats-admin-btn"
              onClick={() => navigate('/admin')}
              title="Admin Panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              Admin
            </button>
          )}
          <button className="ustats-icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
          <div className="ustats-user-menu">
            <Avatar
              name="User"
              className="ustats-avatar"
              onClick={() => setShowUserMenu(!showUserMenu)}
            />
            {showUserMenu && (
              <div className="ustats-dropdown">
                <button className="ustats-dropdown-item" onClick={() => navigate('/profile')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profile
                </button>
                <button className="ustats-dropdown-item danger" onClick={handleLogout}>
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
      <main className="ustats-main">
        {/* Header */}
        <div className="ustats-header">
          <div className="ustats-header-content">
            <h1>My Statistics</h1>
            <p>Track your document analysis history and originality metrics</p>
          </div>
        </div>

        {/* Primary Stats Row */}
        <section className="ustats-primary-cards">
          {/* Total Reports Card */}
          <div className="ustats-card">
            <div className="ustats-card-header">
              <span className="ustats-card-label">Total Reports</span>
              <div className="ustats-card-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
            </div>
            <div className="ustats-card-body">
              <h2 className="ustats-card-value">{totalReports}</h2>
              <div className="ustats-card-trend-row">
                <span className="ustats-card-trend positive">+{reportsThisMonth} this month</span>
                <div className="ustats-sparkline">
                  <svg viewBox="0 0 60 20" preserveAspectRatio="none">
                    <polyline
                      points={sparklineData.map((val, i) => `${i * 12},${20 - (val / maxSparkline) * 16}`).join(' ')}
                      fill="none"
                      stroke="#1e40af"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <p className="ustats-card-description">Documents uploaded and analyzed</p>
          </div>

          {/* Average Similarity Card */}
          <div className="ustats-card">
            <div className="ustats-card-header">
              <span className="ustats-card-label">Average Similarity</span>
              <div className={`ustats-card-icon ${averageSimilarity < 30 ? 'green' : averageSimilarity < 50 ? 'yellow' : 'red'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
            </div>
            <div className="ustats-card-body">
              <h2 className="ustats-card-value">{averageSimilarity.toFixed(1)}%</h2>
              <span className={`ustats-originality-badge ${originalityMessage.type}`}>
                {originalityMessage.type === 'excellent' && '★ '}
                {originalityMessage.type.charAt(0).toUpperCase() + originalityMessage.type.slice(1)}
              </span>
            </div>
            <p className="ustats-card-description">{originalityMessage.text}</p>
          </div>

          {/* High Risk Alerts Card */}
          <div className="ustats-card">
            <div className="ustats-card-header">
              <span className="ustats-card-label">High-Risk Alerts</span>
              <div className={`ustats-card-icon ${highRiskAlerts > 0 ? 'red' : 'green'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
                </svg>
              </div>
            </div>
            <div className="ustats-card-body">
              <h2 className="ustats-card-value">{highRiskAlerts}</h2>
              {highRiskAlerts === 0 ? (
                <span className="ustats-alert-badge clear">All Clear</span>
              ) : (
                <span className="ustats-alert-badge warning">Needs Review</span>
              )}
            </div>
            <p className="ustats-card-description">Reports with similarity ≥{highRiskThreshold}%</p>
          </div>

          {/* Total Words Card */}
          <div className="ustats-card">
            <div className="ustats-card-header">
              <span className="ustats-card-label">Words Analyzed</span>
              <div className="ustats-card-icon purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 7 4 4 20 4 20 7"/>
                  <line x1="9" y1="20" x2="15" y2="20"/>
                  <line x1="12" y1="4" x2="12" y2="20"/>
                </svg>
              </div>
            </div>
            <div className="ustats-card-body">
              <h2 className="ustats-card-value">{totalWordsScanned.toLocaleString()}</h2>
              <span className="ustats-pages-badge">~{getPagesEquivalent(totalWordsScanned)} pages</span>
            </div>
            <p className="ustats-card-description">Cumulative words across all documents</p>
          </div>
        </section>

        {/* Secondary Section */}
        <section className="ustats-secondary">
          {/* Originality Trend */}
          <div className="ustats-trend-card">
            <div className="ustats-trend-header">
              <div className="ustats-trend-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
                <h3>Originality Trend</h3>
              </div>
              {trendChange !== 0 && (
                <div className={`ustats-trend-badge ${trendImproving ? 'positive' : 'negative'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {trendImproving ? (
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                    ) : (
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    )}
                  </svg>
                  <span>{Math.abs(trendChange).toFixed(1)}% vs last month</span>
                </div>
              )}
            </div>
            <p className="ustats-trend-subtitle">
              {trendImproving
                ? "Your average similarity decreased — improving originality!"
                : trendChange > 0
                  ? "Your average similarity increased — consider reviewing recent submissions"
                  : "Track your originality improvements over time"}
            </p>

            <div className="ustats-trend-chart">
              <div className="ustats-trend-y-axis">
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <div className="ustats-trend-area">
                <div className="ustats-trend-grid">
                  <div className="ustats-trend-grid-line"></div>
                  <div className="ustats-trend-grid-line"></div>
                  <div className="ustats-trend-grid-line"></div>
                </div>
                <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="ustats-trend-svg">
                  <defs>
                    <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={trendImproving ? "#22c55e" : "#1e40af"} stopOpacity="0.2"/>
                      <stop offset="100%" stopColor={trendImproving ? "#22c55e" : "#1e40af"} stopOpacity="0.02"/>
                    </linearGradient>
                  </defs>
                  {originalityTrendData.filter(d => d.value !== null).length > 1 && (
                    <>
                      <path
                        d={`M ${originalityTrendData.map((d, i) => {
                          if (d.value === null) return '';
                          const x = (i / (originalityTrendData.length - 1)) * 200;
                          const y = 80 - (d.value / 50) * 80;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        }).filter(Boolean).join(' ')} L 200 80 L 0 80 Z`}
                        fill="url(#trendGradient)"
                      />
                      <path
                        d={originalityTrendData.map((d, i) => {
                          if (d.value === null) return '';
                          const x = (i / (originalityTrendData.length - 1)) * 200;
                          const y = 80 - (d.value / 50) * 80;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        }).filter(Boolean).join(' ')}
                        fill="none"
                        stroke={trendImproving ? "#22c55e" : "#1e40af"}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                </svg>
              </div>
              <div className="ustats-trend-x-axis">
                {originalityTrendData.map((d, i) => (
                  <span key={i}>{d.month}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Top Overlapping Terms */}
          <div className="ustats-terms-card">
            <div className="ustats-terms-header">
              <div className="ustats-terms-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                </svg>
                <h3>Top Overlapping Terms</h3>
              </div>
            </div>
            <p className="ustats-terms-subtitle">Most frequent terms contributing to similarity scores</p>

            <div className="ustats-terms-list">
              {topOverlappingTerms.map((item, index) => (
                <div key={index} className="ustats-term-item">
                  <div className="ustats-term-rank">{index + 1}</div>
                  <span className="ustats-term-text">{item.term}</span>
                  <div className="ustats-term-bar-wrapper">
                    <div className="ustats-term-bar">
                      <div
                        className="ustats-term-bar-fill"
                        style={{ width: `${(item.count / topOverlappingTerms[0].count) * 100}%` }}
                      ></div>
                    </div>
                    <span className="ustats-term-count">{item.count}×</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="ustats-terms-note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
              Common academic terms may appear frequently — focus on context
            </p>
          </div>
        </section>

        {/* Recent Activity */}
        <section className="ustats-activity">
          <div className="ustats-activity-header">
            <div>
              <h2>Recent Activity</h2>
              <p className="ustats-activity-subtitle">Your latest document analyses</p>
            </div>
            <Link to="/dashboard" className="ustats-view-all-link">
              View All Reports
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <div className="ustats-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <h3>No reports yet</h3>
              <p>Upload your first document to see your activity here</p>
              <Link to="/dashboard" className="ustats-upload-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Upload Document
              </Link>
            </div>
          ) : (
            <div className="ustats-activity-list">
              {recentActivity.map((submission) => {
                const similarity = submission.similarity_score || 0;
                const riskLevel = calculateRiskLevel(similarity, null, statisticsRiskOptions);
                return (
                  <div key={submission.id} className="ustats-activity-item">
                    <div className="ustats-activity-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div className="ustats-activity-content">
                      <span className="ustats-activity-name">{submission.filename}</span>
                      <span className="ustats-activity-date">{formatDate(submission.uploaded_at)}</span>
                    </div>
                    <div className="ustats-activity-stats">
                      {submission.status === 'completed' ? (
                        <>
                          <span className={`ustats-activity-score ${riskLevel}`}>
                            {similarity.toFixed(0)}%
                          </span>
                          <span className={`ustats-activity-risk ${riskLevel}`}>
                            {getRiskLabel(riskLevel)}
                          </span>
                        </>
                      ) : (
                        <span className="ustats-activity-pending">{submission.status}</span>
                      )}
                    </div>
                    <button
                      className="ustats-activity-action"
                      onClick={() => navigate(`/results/${submission.id}`)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default UserStatistics;
