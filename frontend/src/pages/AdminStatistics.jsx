import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import './adminStatistics.css';

function AdminStatistics() {
  const { user, logout, isAdmin } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="admin-statistics">
      {/* Navbar */}
      <nav className="stats-navbar">
        <div className="stats-navbar-left">
          <Link to="/" className="stats-logo">
            <svg className="stats-logo-icon" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2"/>
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="stats-logo-text">Authentiq</span>
          </Link>
          <div className="stats-nav-links">
            <Link to="/dashboard" className="stats-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Dashboard
            </Link>
            <Link to="/statistics" className="stats-nav-link active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              System Statistics
            </Link>
          </div>
        </div>
        <div className="stats-navbar-right">
          {isAdmin && (
            <button
              className="stats-icon-btn admin-btn"
              onClick={() => navigate('/admin')}
              title="Admin Panel"
              style={{ marginRight: '10px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
          )}
          <button className="stats-icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
          <div className="stats-user-menu">
            <div className="stats-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
              <img src="https://ui-avatars.com/api/?name=User&background=1e40af&color=fff" alt="User" />
            </div>
            {showUserMenu && (
              <div className="stats-dropdown">
                <button className="stats-dropdown-item" onClick={() => navigate('/profile')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profile
                </button>
                <button className="stats-dropdown-item danger" onClick={handleLogout}>
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
      <main className="stats-main">
        {/* Header */}
        <div className="stats-header">
          <div className="stats-header-left">
            <h1>System Statistics</h1>
            <p>High-level platform metrics and recent growth.</p>
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
            <button className="stats-download-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <section className="stats-cards">
          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Total Papers Indexed</span>
              <div className="stats-card-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
            </div>
            <h2 className="stats-card-value">128,452</h2>
            <p className="stats-card-trend positive">+0.8% from last month</p>
            <p className="stats-card-description">Sum of indexed corpus available for search</p>
          </div>

          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Total Unique Words</span>
              <div className="stats-card-icon purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 7 4 4 20 4 20 7"/>
                  <line x1="9" y1="20" x2="15" y2="20"/>
                  <line x1="12" y1="4" x2="12" y2="20"/>
                </svg>
              </div>
            </div>
            <h2 className="stats-card-value">3,245,891</h2>
            <p className="stats-card-description">Length of global vocabulary set</p>
          </div>

          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Total Registered Users</span>
              <div className="stats-card-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                  <path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
            </div>
            <h2 className="stats-card-value">24,110</h2>
            <p className="stats-card-trend positive">+124 this week</p>
            <p className="stats-card-description">All active registered accounts</p>
          </div>

          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Avg. Document Length</span>
              <div className="stats-card-icon gray">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
            </div>
            <h2 className="stats-card-value">4,120 words</h2>
            <p className="stats-card-description">Mean word count across all records</p>
          </div>
        </section>

        {/* Bottom Section */}
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
              <div className="stats-chart-badge">
                <span className="stats-chart-badge-value">+47</span>
                <span className="stats-chart-badge-label">PAPERS ADDED THIS MONTH</span>
              </div>
            </div>
            <p className="stats-chart-subtitle">Document indexing trajectory over time</p>

            <div className="stats-line-chart">
              <div className="stats-chart-y-axis">
                <span>129k</span>
                <span>128k</span>
                <span>128k</span>
                <span>128k</span>
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
                    d="M 0 100 C 40 95, 80 85, 120 75 S 200 60, 240 50 S 320 35, 360 25 S 390 18, 400 15"
                    fill="none"
                    stroke="#1e40af"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M 0 100 C 40 95, 80 85, 120 75 S 200 60, 240 50 S 320 35, 360 25 S 390 18, 400 15 L 400 120 L 0 120 Z"
                    fill="url(#chartGradient)"
                  />
                </svg>
              </div>
              <div className="stats-chart-x-axis">
                <span>08/23</span>
                <span>09/23</span>
                <span>10/23</span>
                <span>11/23</span>
                <span>12/23</span>
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
                <span className="stats-metric-label">Median Analysis Time</span>
                <div className="stats-metric-value">
                  <span className="stats-metric-number">12s</span>
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
                  <span className="stats-metric-number">45s</span>
                  <span className="stats-metric-status critical">CRITICAL P95</span>
                </div>
              </div>
            </div>

            <div className="stats-latency-section">
              <div className="stats-latency-header">
                <span className="stats-latency-title">RECENT LATENCY TREND</span>
                <span className="stats-latency-live">LIVE</span>
              </div>
              <div className="stats-latency-chart">
                <svg viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="latencyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05"/>
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0 40 L 25 35 L 50 38 L 75 30 L 100 32 L 125 25 L 150 28 L 175 20 L 200 15 L 200 50 L 0 50 Z"
                    fill="url(#latencyGradient)"
                  />
                  <path
                    d="M 0 40 L 25 35 L 50 38 L 75 30 L 100 32 L 125 25 L 150 28 L 175 20 L 200 15"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>

            <p className="stats-processing-description">
              Average time to analyze a document. 95th percentile shows tail latency across global regions.
            </p>

            <a href="#" className="stats-view-link">
              View performance details
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="stats-footer">
        <p className="stats-footer-copyright">© 2026 Authentiq. All rights reserved.</p>
        <div className="stats-footer-links">
          <a href="#" className="stats-footer-link">Privacy Policy</a>
          <a href="#" className="stats-footer-link">Terms of Service</a>
          <a href="#" className="stats-footer-link">Contact Support</a>
        </div>
      </footer>
    </div>
  );
}

export default AdminStatistics;
