import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submissionsAPI } from '../../api/results';
import useAuth from '../../hooks/useAuth';
import Avatar from '../../components/Avatar';
import Logo from '../../components/Logo';
import { processAdaptiveTrendData, generatePlaceholderTrend } from '../../utils/trendUtils';
import './userStatistics.css';

function UserStatistics({ isEmbedded = false }) {
  const { user, logout, isAdmin } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [topOverlappingTerms, setTopOverlappingTerms] = useState([]);
  const [termsLoading, setTermsLoading] = useState(true);
  const [termsError, setTermsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [trendData, setTrendData] = useState(() => processAdaptiveTrendData([], 'similarity_score'));
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');
  const navigate = useNavigate();

  const fetchOverlappingTerms = async ({ isActiveRef } = {}) => {
    if (isActiveRef && !isActiveRef.current) {
      return;
    }

    if (!isActiveRef || isActiveRef.current) {
      setTermsLoading(true);
      setTermsError('');
    }

    try {
      const response = await submissionsAPI.getOverlappingTerms({ limit: 5, minCount: 1 });
      const terms = response?.data?.terms;

      if (isActiveRef && !isActiveRef.current) {
        return;
      }

      setTopOverlappingTerms(Array.isArray(terms) ? terms : []);
    } catch (err) {
      if (isActiveRef && !isActiveRef.current) {
        return;
      }

      console.error('Failed to fetch overlapping terms:', err);
      setTopOverlappingTerms([]);
      setTermsError('Unable to load overlapping terms right now.');
    } finally {
      if (!isActiveRef || isActiveRef.current) {
        setTermsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const isActiveRef = { current: true };
    fetchSubmissions({ isActiveRef, showPageLoader: true });

    (async () => {
      await fetchOverlappingTerms({ isActiveRef });
    })();

    return () => {
      isActiveRef.current = false;
    };
  }, [navigate, user]);

  const fetchSubmissions = async ({ isActiveRef, showPageLoader = false, showTrendLoader = true } = {}) => {
    if (isActiveRef && !isActiveRef.current) {
      return;
    }

    if ((!isActiveRef || isActiveRef.current) && showPageLoader) {
      setLoading(true);
    }

    if ((!isActiveRef || isActiveRef.current) && showTrendLoader) {
      setTrendLoading(true);
      setTrendError('');
    }

    try {
      const response = await submissionsAPI.getAll();
      const fetchedSubmissions = response?.data?.submissions || [];

      if (isActiveRef && !isActiveRef.current) {
        return;
      }

      setSubmissions(fetchedSubmissions);
      setTrendData(processAdaptiveTrendData(fetchedSubmissions, 'similarity_score'));
      setTrendError('');
    } catch (err) {
      if (isActiveRef && !isActiveRef.current) {
        return;
      }

      console.error('Failed to fetch submissions:', err);
      setSubmissions([]);
      setTrendData(processAdaptiveTrendData([], 'similarity_score'));
      setTrendError('Unable to load originality trend right now.');
    } finally {
      if (!isActiveRef || isActiveRef.current) {
        if (showPageLoader) {
          setLoading(false);
        }
        if (showTrendLoader) {
          setTrendLoading(false);
        }
      }
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTrendRetry = () => {
    fetchSubmissions({ showTrendLoader: true });
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

  const highestTermCount = topOverlappingTerms[0]?.count || 1;

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
  const trendSummary = trendData?.trendSummary || {
    text: 'Track your originality improvements over time',
    badgeText: '',
    direction: 'flat',
    tone: 'neutral',
    showBadge: false
  };
  const trendImproving = trendData?.trendImproving ?? false;
  const trendMonths = trendData?.months || [];
  const trendLinePath = trendData?.linePath || '';
  const trendAreaPath = trendData?.areaPath || '';
  const plottableTrendPoints = trendData?.plottablePoints || 0;
  const placeholderTrend = generatePlaceholderTrend();
  const trendGranularity = trendData?.granularity || 'month';
  const trendGranularityLabel = trendData?.granularityLabel || 'monthly';
  const trendUsesFallback = Boolean(trendData?.usedFallbackGranularity);
  const trendPeriodUnit = trendGranularity === 'day'
    ? 'day'
    : trendGranularity === 'week'
      ? 'week'
      : 'month';
  const trendEmptyHint = `Submit completed reports to start tracking your ${trendGranularityLabel} originality.`;
  const trendInsufficientHint = `Add submissions in another ${trendPeriodUnit} to unlock a ${trendGranularityLabel} trend.`;
  const trendPlaceholderTitle = 'No originality trend available yet';
  const trendPlaceholderHint = trendEmptyHint;
  const trendChartColor = trendImproving ? '#22c55e' : '#1e40af';

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
          <Logo to="/" className="ustats-logo" />
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
              name={user?.username || 'User'}
              src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:5000${user.avatar_url}`) : undefined}
              className="ustats-avatar"
              background={user?.role === 'admin' ? '#C53030' : user?.role === 'reviewer' ? '#1E90FF' : '#6b7280'}
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
                <h3>Originality Trend</h3>
              </div>
              {trendSummary.showBadge && (
                <div className={`ustats-trend-badge ${trendSummary.tone === 'positive' ? 'positive' : 'negative'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {trendSummary.direction === 'down' ? (
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                    ) : (
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    )}
                  </svg>
                  <span>{trendSummary.badgeText}</span>
                </div>
              )}
            </div>
            <p className="ustats-trend-subtitle">{trendSummary.text}</p>
            {!trendLoading && !trendError && trendUsesFallback && (
              <p className="ustats-trend-context">
                Showing {trendGranularityLabel} trend because monthly data is still limited.
              </p>
            )}

            {trendLoading ? (
              <div className="ustats-trend-state loading">
                <div className="ustats-trend-skeleton" aria-hidden="true"></div>
                <p>Loading originality trend…</p>
              </div>
            ) : trendError ? (
              <div className="ustats-trend-state error">
                <p>{trendError}</p>
                <button
                  type="button"
                  className="ustats-trend-refresh-btn"
                  onClick={handleTrendRetry}
                >
                  Retry
                </button>
              </div>
            ) : plottableTrendPoints === 0 ? (
              <div className="ustats-trend-placeholder">
                <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="ustats-trend-placeholder-svg" aria-hidden="true">
                  <defs>
                    <linearGradient id="trendPlaceholderGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.28"/>
                      <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.06"/>
                    </linearGradient>
                  </defs>
                  <path d={placeholderTrend.areaPath} fill="url(#trendPlaceholderGradient)" />
                  <path
                    d={placeholderTrend.linePath}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="ustats-trend-placeholder-overlay">
                  <p>{trendPlaceholderTitle}</p>
                  <span>{trendPlaceholderHint}</span>
                </div>
              </div>
            ) : (
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
                        <stop offset="0%" stopColor={trendChartColor} stopOpacity="0.2"/>
                        <stop offset="100%" stopColor={trendChartColor} stopOpacity="0.02"/>
                      </linearGradient>
                    </defs>
                    <path d={trendAreaPath} fill="url(#trendGradient)" />
                    <path
                      d={trendLinePath}
                      fill="none"
                      stroke={trendChartColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="ustats-trend-x-axis">
                  {trendMonths.map((month, index) => (
                    <span key={`${month.label}-${index}`}>{month.label}</span>
                  ))}
                </div>
              </div>
            )}
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

            {termsLoading ? (
              <div className="ustats-terms-state loading">Loading overlapping terms…</div>
            ) : termsError ? (
              <div className="ustats-terms-state error">
                <p>{termsError}</p>
                <button
                  type="button"
                  className="ustats-terms-refresh-btn"
                  onClick={() => fetchOverlappingTerms()}
                >
                  Refresh
                </button>
              </div>
            ) : topOverlappingTerms.length === 0 ? (
              <div className="ustats-terms-state empty">
                <p>No overlapping terms found yet</p>
                <span>Submit more documents to see common terms across your papers.</span>
              </div>
            ) : (
              <>
                <div className="ustats-terms-list">
                  {topOverlappingTerms.map((item, index) => (
                    <div key={`${item.term}-${index}`} className="ustats-term-item">
                      <div className="ustats-term-rank">{index + 1}</div>
                      <span className="ustats-term-text">{item.term}</span>
                      <div className="ustats-term-bar-wrapper">
                        <div className="ustats-term-bar">
                          <div
                            className="ustats-term-bar-fill"
                            style={{ width: `${Math.max(4, (item.count / highestTermCount) * 100)}%` }}
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
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default UserStatistics;
