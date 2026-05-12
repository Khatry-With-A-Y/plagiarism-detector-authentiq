import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminAPI } from '../../api/results';
import useAuth from '../../hooks/useAuth';
import CorpusManagement from './CorpusManagement';
import UserManagement from './UserManagement';
import ReviewerApplications from './ReviewerApplications';
import ReviewQueue from './ReviewQueue';
// Decline-handling Step 6: Reviewer Behaviour merged into User Management.
// The standalone tab is gone; pause / unpause / waive levers live behind
// the per-row "View Details" action in UserManagement.jsx.
import ReviewBadge from '../../components/ReviewBadge';
import Avatar from '../../components/Avatar';
import '../dashboard.css';
import './adminStatistics.css';

function AdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    total_papers_indexed: 0,
    registered_users: 0,
    system_total_reports: 0,
    average_similarity: 0,
    high_risk_alerts: 0
  });
  const [corpusGrowth, setCorpusGrowth] = useState({ labels: [], values: [], added_count: 0 });
  const [growthTimeframe, setGrowthTimeframe] = useState('week');
  const [processingTime, setProcessingTime] = useState({ average_time: 0, p95_time: 0, trend: [] });
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [dateRange] = useState('Last 30 Days');
  const [activeTab, setActiveTab] = useState('dashboard');
  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
    try {
      const response = await adminAPI.getStats();
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCorpusGrowth = useCallback(async () => {
    try {
      const response = await adminAPI.getCorpusGrowth(growthTimeframe);
      setCorpusGrowth(response.data);
    } catch (err) {
      console.error('Failed to fetch corpus growth:', err);
    }
  }, [growthTimeframe]);

  const fetchProcessingTime = useCallback(async () => {
    try {
      const response = await adminAPI.getProcessingTime();
      setProcessingTime(response.data);
    } catch (err) {
      console.error('Failed to fetch processing time:', err);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchStats();
    fetchCorpusGrowth();
    fetchProcessingTime();

    const pollInterval = setInterval(() => {
      fetchStats();
      fetchCorpusGrowth();
      fetchProcessingTime();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [navigate, user, fetchStats, fetchCorpusGrowth, fetchProcessingTime]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const generatePath = (values, height = 120, width = 400) => {
    if (!values || values.length === 0) return `M 0 ${height} L ${width} ${height}`;
    if (values.length === 1) return `M 0 ${height/2} L ${width} ${height/2}`;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const padding = 15;
    const drawHeight = height - padding * 2;
    
    const points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - padding - ((val - min) / range) * drawHeight;
      return `${x} ${y}`;
    });
    
    return `M ${points[0]} L ` + points.slice(1).join(' L ');
  };

  const getYAxisLabels = (values) => {
    if (!values || values.length === 0) return ['0', '0', '0', '0'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const step = range / 3;
    return [
      Math.round(max),
      Math.round(max - step),
      Math.round(max - step * 2),
      Math.round(min)
    ];
  };

  const chartPath = generatePath(corpusGrowth.values);
  const chartFillPath = `${chartPath} L 400 120 L 0 120 Z`;
  const yAxisLabels = getYAxisLabels(corpusGrowth.values);

  const generateLatencyPath = (values, height = 50, width = 200) => {
    if (!values || values.length === 0) return `M 0 ${height} L ${width} ${height}`;
    if (values.length === 1) return `M 0 ${height/2} L ${width} ${height/2}`;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const padding = 5;
    const drawHeight = height - padding * 2;
    
    const points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - padding - ((val - min) / range) * drawHeight;
      return `${x} ${y}`;
    });
    
    return `M ${points[0]} L ` + points.slice(1).join(' L ');
  };

  const latencyPath = generateLatencyPath(processingTime.trend);
  const latencyFillPath = `${latencyPath} L 200 50 L 0 50 Z`;

  const getLatencyYAxisLabels = (values) => {
    if (!values || values.length === 0) return ['0s', '0s'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [
      `${max.toFixed(1)}s`,
      `${min.toFixed(1)}s`
    ];
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Navbar */}
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
            <button
              className={`dashboard-nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Admin Dashboard
            </button>
            <button
              className={`dashboard-nav-link ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              User Management
            </button>
            <button
              className={`dashboard-nav-link ${activeTab === 'corpus' ? 'active' : ''}`}
              onClick={() => setActiveTab('corpus')}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Corpus Management
            </button>
            {/* Block 7 (Stage 7c): reviewer onboarding tab — shows a count badge
                with the number of pending applications awaiting admin review. */}
            <ReviewBadge
              variant="reviewer-applications"
              mode="nav"
              alwaysVisible
              labelOverride="Reviewer Onboarding"
              isActive={activeTab === 'reviewers'}
              onClick={() => setActiveTab('reviewers')}
            />
            {/* Block 7: peer-review queue tab — shows a count badge when items need attention. */}
            <ReviewBadge
              variant="admin"
              mode="nav"
              alwaysVisible
              labelOverride="Peer Review Queue"
              isActive={activeTab === 'review-queue'}
              onClick={() => setActiveTab('review-queue')}
            />
            {/* Decline-handling Step 6: the standalone Reviewer Behaviour
                tab was removed; its aggregations and pause / unpause / waive
                controls now live inside User Management → per-row View Details. */}
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
              name="Admin"
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

      {/* Main Content */}
      {activeTab === 'corpus' ? (
        <CorpusManagement isEmbedded={true} />
      ) : activeTab === 'users' ? (
        <UserManagement isEmbedded={true} />
      ) : activeTab === 'reviewers' ? (
        <main className="dashboard-main">
          <ReviewerApplications />
        </main>
      ) : activeTab === 'review-queue' ? (
        <main className="dashboard-main">
          <ReviewQueue />
        </main>
      ) : (
      <main className="dashboard-main">
        {/* Header */}
        <div className="stats-header" style={{ marginBottom: '2rem' }}>
          <div className="stats-header-left">
            <h1>System Overview</h1>
            <p>Welcome to the Admin Dashboard. Monitor systemwide statistics and operations.</p>
          </div>
          <div className="stats-header-right">
            <div className="stats-date-dropdown">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {dateRange}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Combined Stats Cards */}
        <section className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">Total Papers Indexed</p>
              <h3 className="dashboard-stat-value">{stats.total_papers_indexed.toLocaleString()}</h3>
            </div>
            <div className="dashboard-stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">Registered Users</p>
              <h3 className="dashboard-stat-value">{stats.registered_users.toLocaleString()}</h3>
            </div>
            <div className="dashboard-stat-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">System Total Reports</p>
              <h3 className="dashboard-stat-value">{stats.system_total_reports.toLocaleString()}</h3>
            </div>
            <div className="dashboard-stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">Average Similarity</p>
              <h3 className="dashboard-stat-value">{stats.average_similarity}%</h3>
            </div>
            <div className="dashboard-stat-icon gray">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-content">
              <p className="dashboard-stat-label">High Risk Alerts</p>
              <h3 className="dashboard-stat-value">{stats.high_risk_alerts.toLocaleString()}</h3>
            </div>
            <div className="dashboard-stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
              </svg>
            </div>
          </div>
        </section>

        {/* Charts from AdminStatistics */}
        <section className="stats-bottom">
          {/* Corpus Growth Chart */}
          <div className="stats-chart-card">
            <div className="stats-chart-header">
              <div className="stats-chart-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
                <h3>Corpus Growth</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <select 
                  value={growthTimeframe} 
                  onChange={(e) => setGrowthTimeframe(e.target.value)}
                  style={{ 
                    padding: '6px 28px 6px 12px', 
                    fontSize: '13px', 
                    borderRadius: '8px', 
                    border: '1px solid #c7d2fe', 
                    outline: 'none', 
                    background: '#eff6ff', 
                    color: '#1e40af', 
                    fontWeight: '600',
                    cursor: 'pointer',
                    appearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%231e40af%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px top 50%',
                    backgroundSize: '10px auto',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.target.style.borderColor = '#818cf8'; e.target.style.background = '#e0e7ff'; }}
                  onMouseOut={(e) => { e.target.style.borderColor = '#c7d2fe'; e.target.style.background = '#eff6ff'; }}
                >
                  <option value="past_hour">Past Hour</option>
                  <option value="24_hours">Last 24 Hours</option>
                  <option value="week">Past Week</option>
                </select>
                <div className="stats-chart-badge">
                  <span className="stats-chart-badge-value">+{corpusGrowth.added_count}</span>
                  <span className="stats-chart-badge-label">
                    {growthTimeframe === 'past_hour' ? 'ADDED PAST HOUR' :
                     growthTimeframe === '24_hours' ? 'ADDED LAST 24H' :
                     'ADDED THIS WEEK'}
                  </span>
                </div>
              </div>
            </div>
            <p className="stats-chart-subtitle">Document indexing trajectory over time</p>

            <div className="stats-line-chart">
              <div className="stats-chart-y-axis">
                {yAxisLabels.map((val, i) => <span key={i}>{val >= 1000 ? (val/1000).toFixed(1)+'k' : val}</span>)}
              </div>
              <div className="stats-chart-area">
                <div className="stats-chart-grid">
                  <div className="stats-chart-grid-line"></div>
                  <div className="stats-chart-grid-line"></div>
                  <div className="stats-chart-grid-line"></div>
                  <div className="stats-chart-grid-line"></div>
                </div>
                <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="stats-chart-svg">
                  <defs>
                    <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#1e40af" stopOpacity="0.15"/>
                      <stop offset="100%" stopColor="#1e40af" stopOpacity="0.02"/>
                    </linearGradient>
                  </defs>
                  <path
                    d={chartPath}
                    fill="none"
                    stroke="#1e40af"
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={chartFillPath}
                    fill="url(#chartGradient)"
                  />
                </svg>
              </div>
              <div className="stats-chart-x-axis">
                {corpusGrowth.labels.map((label, i) => {
                  if (corpusGrowth.labels.length > 7 && i % 2 !== 0 && i !== corpusGrowth.labels.length - 1) return <span key={i}></span>;
                  return <span key={i}>{label}</span>;
                })}
              </div>
            </div>
          </div>

          {/* Processing Time Card */}
          <div className="stats-processing-card">
            <div className="stats-processing-header">
              <div className="stats-processing-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <h3>Processing Time</h3>
              </div>
              <div className="stats-processing-check">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12h4l3-9 6 18 3-9h4"/>
                </svg>
              </div>
            </div>
            <p className="stats-processing-subtitle">Real-time analysis latency performance</p>

            <div className="stats-processing-metrics">
              <div className="stats-metric-row">
                <div className="stats-metric-icon blue">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </div>
                <span className="stats-metric-label">Average Analysis Time</span>
                <div className="stats-metric-value">
                  <span className="stats-metric-number">{processingTime.average_time}s</span>
                  <span className="stats-metric-status optimal">OPTIMAL</span>
                </div>
              </div>
              <div className="stats-metric-row">
                <div className="stats-metric-icon gray">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <span className="stats-metric-label">95th Percentile</span>
                <div className="stats-metric-value">
                  <span className="stats-metric-number">{processingTime.p95_time}s</span>
                  <span className="stats-metric-status critical">CRITICAL P95</span>
                </div>
              </div>
            </div>

            <div className="stats-latency-section">
              <div className="stats-latency-header">
                <span className="stats-latency-title">RECENT LATENCY TREND</span>
                <span className="stats-latency-live">LIVE</span>
              </div>
              <p className="stats-latency-description" style={{fontSize: '13px', color: '#4b5563', marginBottom: '8px'}}>
                Measured from document upload to final report generation.
              </p>
              <div className="stats-latency-chart-container" style={{display: 'flex', alignItems: 'stretch', gap: '8px'}}>
                <div className="stats-latency-y-axis" style={{display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', textAlign: 'right', paddingBottom: '4px'}}>
                  <span>{getLatencyYAxisLabels(processingTime.trend)[0]}</span>
                  <span>{getLatencyYAxisLabels(processingTime.trend)[1]}</span>
                </div>
                <div className="stats-latency-chart" style={{flex: 1}}>
                  <svg viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="latencyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05"/>
                    </linearGradient>
                  </defs>
                  <path
                    d={latencyFillPath}
                    fill="url(#latencyGradient)"
                  />
                  <path
                    d={latencyPath}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      )}

      {/* Footer */}
      <footer className="dashboard-footer">
        <p className="dashboard-footer-copyright">© 2026 Authentiq Plagiarism Detection. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default AdminDashboard;
