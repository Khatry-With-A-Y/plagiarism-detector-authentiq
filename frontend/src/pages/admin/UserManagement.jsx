import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import Avatar from '../../components/Avatar';
import Logo from '../../components/Logo';
import { adminAPI } from '../../api/results';
import reviewersAPI from '../../api/reviewers';
import reviewsAPI from '../../api/reviews';
import '../dashboard.css';
import './userManagement.css';

/**
 * Decline-handling Step 6: User Management now also surfaces the per-reviewer
 * decline / expiry / vote counters and the pause / unpause / waive levers
 * that previously lived on a separate "Reviewer Behaviour" admin tab.
 *
 * The table stays compact (identity + role + status + actions), while
 * activity and reviewer-behaviour counters are surfaced in the modal —
 * institution row, full metric grid, recent decline events with Waive,
 * Pause / Unpause buttons — is exposed behind the existing "View Details"
 * action button so the table stays compact.
 *
 * See .junie/plans/decline-handling-implementation.md § Step 6.
 */
function UserManagement({ isEmbedded = false }) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Reviewer-behaviour overlay (fetched in parallel with /auth/users).
  // `behaviourByUserId` maps reviewer user_id -> aggregated row; the table
  // joins this in render so non-reviewers fall back to plain rows.
  const [behaviourByUserId, setBehaviourByUserId] = useState({});
  const [softLimit, setSoftLimit] = useState(3);
  const [hardLimit, setHardLimit] = useState(5);
  const [windowDays, setWindowDays] = useState(30);

  // Per-user Details modal state.
  const [detailsUser, setDetailsUser] = useState(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [declineEvents, setDeclineEvents] = useState({ loading: false, events: [], error: null });
  const [pausePrompt, setPausePrompt] = useState({ open: false, reason: '' });
  const [unpausePromptOpen, setUnpausePromptOpen] = useState(false);

  const navigate = useNavigate();

  // Pull users + reviewer behaviour together. Behaviour fetch failures are
  // logged but do NOT block the table — admins must still see the user list
  // even if the aggregation endpoint is unavailable.
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, behaviourRes] = await Promise.allSettled([
        adminAPI.getUsers(),
        reviewersAPI.adminGetReviewerBehaviour(),
      ]);

      if (usersRes.status === 'fulfilled') {
        setUsersList(usersRes.value.data.users || []);
      } else {
        console.error('Failed to fetch users:', usersRes.reason);
        setUsersList([]);
      }

      if (behaviourRes.status === 'fulfilled') {
        const data = behaviourRes.value.data || {};
        const map = {};
        (data.reviewers || []).forEach((row) => {
          if (row && typeof row.user_id === 'number') map[row.user_id] = row;
        });
        setBehaviourByUserId(map);
        if (typeof data.soft_limit === 'number') setSoftLimit(data.soft_limit);
        if (typeof data.hard_limit === 'number') setHardLimit(data.hard_limit);
        if (typeof data.window_days === 'number') setWindowDays(data.window_days);
      } else {
        // 403 for non-admins is fine — the rest of the page still works.
        console.warn('Failed to fetch reviewer behaviour overlay:', behaviourRes.reason);
        setBehaviourByUserId({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Filter users by search query, role and status
  const filteredUsers = usersList.filter((u) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query === '' ||
      (u.username && u.username.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesQuery && matchesRole && matchesStatus;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    if (filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleStatus = async (userId, currentRole, currentStatus) => {
    if (currentRole === 'admin') return; // Cannot modify admin
    // Paused reviewers are NOT flipped by the active/blocked toggle —
    // admin must Unpause from the Details modal first. This guard keeps
    // the toggle's two-state visual contract intact.
    if (currentStatus === 'paused') return;
    try {
      const response = await adminAPI.toggleUserStatus(userId);
      const newStatus = response.data.status;
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    } catch (error) {
      console.error('Failed to toggle user status:', error);
      alert('Failed to update user status');
    }
  };

  // ---------------------------------------------------------------------
  // Reviewer-behaviour helpers (Step 6 — merged from ReviewerBehaviour.jsx)
  // ---------------------------------------------------------------------

  const fmtCategory = (cat) => (cat ? String(cat).replace(/_/g, ' ') : 'unspecified');

  const openDetails = async (userItem) => {
    setDetailsUser(userItem);
    setDetailsError(null);
    setPausePrompt({ open: false, reason: '' });
    setUnpausePromptOpen(false);
    // Only reviewers carry decline events; skip the fetch for plain users
    // and admins to keep the modal snappy.
    if (userItem.role !== 'reviewer') {
      setDeclineEvents({ loading: false, events: [], error: null });
      return;
    }
    setDeclineEvents({ loading: true, events: [], error: null });
    try {
      const res = await reviewersAPI.adminGetReviewerDeclineEvents(userItem.id, 20);
      setDeclineEvents({
        loading: false,
        events: res.data?.events || [],
        error: null,
      });
    } catch (err) {
      setDeclineEvents({
        loading: false,
        events: [],
        error: err?.response?.data?.error || 'Failed to load decline events.',
      });
    }
  };

  const closeDetails = () => {
    setDetailsUser(null);
    setDetailsError(null);
    setDeclineEvents({ loading: false, events: [], error: null });
    setPausePrompt({ open: false, reason: '' });
    setUnpausePromptOpen(false);
  };

  // After any pause / unpause / waive, refresh both the table data and the
  // currently-open modal's decline-events drawer so counts stay in sync.
  const refreshAfterMutation = async (userId) => {
    await fetchAll();
    if (detailsUser && detailsUser.id === userId && detailsUser.role === 'reviewer') {
      try {
        const res = await reviewersAPI.adminGetReviewerDeclineEvents(userId, 20);
        setDeclineEvents({
          loading: false,
          events: res.data?.events || [],
          error: null,
        });
        // Refresh user.status from the freshly-fetched users list.
        setDetailsUser((prev) => {
          if (!prev) return prev;
          const fresh = (usersList || []).find((u) => u.id === userId);
          return fresh ? { ...prev, status: fresh.status } : prev;
        });
      } catch (_) { /* non-fatal */ }
    }
  };

  const handleConfirmPause = async () => {
    if (!detailsUser) return;
    setDetailsBusy(true);
    setDetailsError(null);
    try {
      await reviewersAPI.adminPauseReviewer(
        detailsUser.id,
        pausePrompt.reason.trim() || null,
      );
      setPausePrompt({ open: false, reason: '' });
      await refreshAfterMutation(detailsUser.id);
      // Reflect the new status locally so the modal pill updates immediately.
      setDetailsUser((prev) => (prev ? { ...prev, status: 'paused' } : prev));
    } catch (err) {
      setDetailsError(err?.response?.data?.error || 'Pause failed.');
    } finally {
      setDetailsBusy(false);
    }
  };

  const handleRequestUnpause = () => {
    if (!detailsUser || detailsBusy) return;
    setUnpausePromptOpen(true);
  };

  const handleCancelUnpause = () => {
    if (detailsBusy) return;
    setUnpausePromptOpen(false);
  };

  const handleConfirmUnpause = async () => {
    if (!detailsUser) return;
    setDetailsBusy(true);
    setDetailsError(null);
    try {
      await reviewersAPI.adminUnpauseReviewer(detailsUser.id);
      await refreshAfterMutation(detailsUser.id);
      setDetailsUser((prev) => (prev ? { ...prev, status: 'active' } : prev));
      setUnpausePromptOpen(false);
    } catch (err) {
      setDetailsError(err?.response?.data?.error || 'Unpause failed.');
    } finally {
      setDetailsBusy(false);
    }
  };

  const handleWaive = async (event) => {
    if (!detailsUser) return;
    if (!window.confirm(
      `Waive this decline event on submission #${event.submission_id}? ` +
      `It will no longer count toward ${detailsUser.username}'s pause threshold.`,
    )) {
      return;
    }
    setDetailsBusy(true);
    setDetailsError(null);
    try {
      await reviewsAPI.adminWaiveDeclineEvent(event.submission_id, detailsUser.id);
      await refreshAfterMutation(detailsUser.id);
    } catch (err) {
      setDetailsError(err?.response?.data?.error || 'Waive failed.');
    } finally {
      setDetailsBusy(false);
    }
  };

  // Returns a status-pill descriptor: { label, kind } where `kind` drives
  // the CSS class (usermgmt-status-pill <kind>). Reviewers get a third
  // "paused" pill plus an optional amber "near-limit" indicator surfaced
  // alongside it in the cell.
  const statusInfo = (userItem) => {
    if (userItem.status === 'paused') return { label: 'Paused', kind: 'paused' };
    if (userItem.status === 'blocked') return { label: 'Blocked', kind: 'blocked' };
    return { label: 'Active', kind: 'active' };
  };

  return (
    <div className="dashboard">
      {/* Navbar */}
      {!isEmbedded && (
      <nav className="dashboard-navbar">
        <div className="dashboard-navbar-left">
          <Logo to="/" className="dashboard-logo" />
          <div className="dashboard-nav-links">
            <Link to="/dashboard" className="dashboard-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Admin Dashboard
            </Link>
            <Link to="/users" className="dashboard-nav-link active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              User Management
            </Link>
            <Link to="/admin" className="dashboard-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Corpus Management
            </Link>
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
              name={user?.username || 'Admin'}
              src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:5000${user.avatar_url}`) : undefined}
              className="dashboard-avatar"
              background="#C53030"
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
      )}

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Header */}
        <div className="stats-header">
          <div className="stats-header-left">
            <h1>User Management</h1>
            <p>Manage accounts, roles, and platform activity logs.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="usermgmt-filters">
          <div className="usermgmt-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Search name or email address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="usermgmt-filter-dropdown"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">Role: All</option>
            <option value="admin">Role: Admin</option>
            <option value="reviewer">Role: Reviewer</option>
            <option value="user">Role: User</option>
          </select>
          <select
            className="usermgmt-filter-dropdown"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Status: All</option>
            <option value="active">Status: Active</option>
            <option value="paused">Status: Paused</option>
            <option value="blocked">Status: Blocked</option>
          </select>
        </div>

        {/* Table */}
        <div className="usermgmt-table-container">
          <table className="usermgmt-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="usermgmt-checkbox"
                    checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length}
                    onChange={toggleAllUsers}
                  />
                </th>
                <th>User Name</th>
                <th>Role</th>
                <th>Registered</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Loading users...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No users found.</td>
                </tr>
              ) : (
                filteredUsers.map((userItem) => {
                  const behaviour = behaviourByUserId[userItem.id] || null;
                  const isReviewer = userItem.role === 'reviewer';
                  const countable = behaviour?.countable_declines ?? 0;
                  const nearLimit = isReviewer && countable >= softLimit && countable < hardLimit;
                  const pill = statusInfo(userItem);
                  return (
                    <tr key={userItem.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="usermgmt-checkbox"
                          checked={selectedUsers.includes(userItem.id)}
                          onChange={() => toggleUserSelection(userItem.id)}
                        />
                      </td>
                      <td>
                        <div className="usermgmt-user-cell">
                          <Avatar
                            name={userItem.username || 'User'}
                            className="usermgmt-avatar"
                            background={userItem.role === 'admin' ? '#C53030' : userItem.role === 'reviewer' ? '#1E90FF' : '#6b7280'}
                            alt={userItem.username}
                          />
                          <div className="usermgmt-user-info">
                            <span className="usermgmt-user-name">{userItem.username}</span>
                            <span className="usermgmt-user-email">{userItem.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`usermgmt-role-badge ${userItem.role}`}>
                          {userItem.role.charAt(0).toUpperCase() + userItem.role.slice(1)}
                        </span>
                      </td>
                      <td>
                        <span className="usermgmt-date">{formatDate(userItem.created_at)}</span>
                      </td>
                      <td>
                        {/* Status cell:
                            - admins: read-only "Active" pill
                            - paused reviewers: red "Paused" pill (toggle disabled)
                            - everyone else: pill + active/blocked toggle
                            - near-limit reviewers also get a small amber tag
                        */}
                        <div className="usermgmt-status-cell">
                          <span className={`usermgmt-status-pill ${pill.kind}`}>{pill.label}</span>
                          {nearLimit && pill.kind === 'active' && (
                            <span className="usermgmt-near-limit" title={`Soft warning at ${softLimit} countable declines`}>
                              Near Limit
                            </span>
                          )}
                          {userItem.role !== 'admin' && userItem.status !== 'paused' && (
                            <div
                              className="usermgmt-toggle-wrapper"
                              onClick={() => handleToggleStatus(userItem.id, userItem.role, userItem.status)}
                              style={{ cursor: 'pointer' }}
                              title={userItem.status === 'active' ? 'Click to block' : 'Click to unblock'}
                            >
                              <div className={`usermgmt-toggle ${userItem.status === 'active' ? 'active' : ''}`}></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="usermgmt-actions">
                          <button
                            className="usermgmt-action-btn"
                            title="View Details"
                            onClick={() => openDetails(userItem)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="usermgmt-pagination">
            <span className="usermgmt-pagination-info">
              {filteredUsers.length > 0 ? `1-${filteredUsers.length} of ${filteredUsers.length} users` : '0 users'}
            </span>
            <div className="usermgmt-pagination-btns">
              <button className="usermgmt-page-btn" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button className="usermgmt-page-btn active">1</button>
              <button className="usermgmt-page-btn" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Step 6: per-user Details modal — replaces the standalone     */}
        {/* "Reviewer Behaviour" admin tab. Reuses the project-wide       */}
        {/* dashboard-modal-* styling already shipped in dashboard.css.   */}
        {/* ------------------------------------------------------------ */}
        {detailsUser && (() => {
          const u = detailsUser;
          const b = behaviourByUserId[u.id] || null;
          const isReviewer = u.role === 'reviewer';
          const countable = b?.countable_declines ?? 0;
          const pill = statusInfo(u);
          const nearLimit = isReviewer && countable >= softLimit && countable < hardLimit;
          return (
            <div className="dashboard-modal-overlay" onClick={closeDetails}>
              <div
                className="dashboard-modal usermgmt-details-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="dashboard-modal-header">
                  <h3>User Details</h3>
                  <p>{u.username} · {u.email}</p>
                </div>
                <div className="dashboard-modal-body">
                  {/* Identity & status grid */}
                  <div className="usermgmt-details-grid">
                    <div className="usermgmt-details-field">
                      <span className="usermgmt-details-label">Role</span>
                      <span className={`usermgmt-role-badge ${u.role}`}>
                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </div>
                    <div className="usermgmt-details-field">
                      <span className="usermgmt-details-label">Status</span>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <span className={`usermgmt-status-pill ${pill.kind}`}>{pill.label}</span>
                        {nearLimit && (
                          <span className="usermgmt-near-limit">Near Limit</span>
                        )}
                      </span>
                    </div>
                    <div className="usermgmt-details-field">
                      <span className="usermgmt-details-label">Registered</span>
                      <span>{formatDate(u.created_at)}</span>
                    </div>
                    <div className="usermgmt-details-field">
                      <span className="usermgmt-details-label">Activity</span>
                      <span>{u.activity || 0}</span>
                    </div>
                  </div>

                  {/* Paused-state banner with auto-unpause anchor. */}
                  {u.status === 'paused' && b && (
                    <div className="usermgmt-paused-banner">
                      <strong>Paused.</strong>{' '}
                      {b.paused_reason && (
                        <span>
                          Reason: <code>{b.paused_reason}</code>.{' '}
                        </span>
                      )}
                      {b.paused_until ? (
                        <span>
                          Earliest auto-unpause:{' '}
                          <strong>{new Date(b.paused_until).toLocaleDateString()}</strong>.
                        </span>
                      ) : (
                        <span>Manual pause — admin must unpause.</span>
                      )}
                    </div>
                  )}

                  {/* Reviewer-only behaviour metric grid + decline events. */}
                  {isReviewer && (
                    <>
                      <h4 className="usermgmt-details-section">
                        Reviewer behaviour (last {windowDays} days)
                      </h4>
                      <p className="usermgmt-details-help">
                        Soft warning at <strong>{softLimit}</strong> countable declines,
                        auto-pause at <strong>{hardLimit}</strong>. Categories{' '}
                        <code>conflict_of_interest</code> and <code>out_of_expertise</code>{' '}
                        are excluded from the countable total.
                      </p>
                      <div className="usermgmt-metric-grid">
                        <div className="usermgmt-metric">
                          <span className="usermgmt-metric-label">Declines</span>
                          <span className="usermgmt-metric-value">{b?.declines_window ?? 0}</span>
                        </div>
                        <div className="usermgmt-metric">
                          <span className="usermgmt-metric-label">Countable</span>
                          <span
                            className={`usermgmt-metric-value${countable >= hardLimit ? ' over' : countable >= softLimit ? ' near' : ''}`}
                          >
                            {countable}<span style={{ opacity: 0.6 }}> / {hardLimit}</span>
                          </span>
                        </div>
                        <div className="usermgmt-metric">
                          <span className="usermgmt-metric-label">Expiries</span>
                          <span className="usermgmt-metric-value">{b?.expiries_window ?? 0}</span>
                        </div>
                        <div className="usermgmt-metric">
                          <span className="usermgmt-metric-label">Votes</span>
                          <span className="usermgmt-metric-value">{b?.votes_window ?? 0}</span>
                        </div>
                        <div className="usermgmt-metric">
                          <span className="usermgmt-metric-label">Total Assignments</span>
                          <span className="usermgmt-metric-value">{b?.total_assignments ?? 0}</span>
                        </div>
                      </div>

                      <h4 className="usermgmt-details-section">Recent decline events</h4>
                      <div className="usermgmt-events-scroll">
                        {declineEvents.loading ? (
                          <div className="usermgmt-details-help">Loading decline events…</div>
                        ) : declineEvents.error ? (
                          <div className="form-error">{declineEvents.error}</div>
                        ) : declineEvents.events.length === 0 ? (
                          <div className="usermgmt-details-help">No decline events recorded.</div>
                        ) : (
                          <table className="usermgmt-events-table">
                            <thead>
                              <tr>
                                <th>Submission</th>
                                <th>Declined At</th>
                                <th>Category</th>
                                <th>Reason</th>
                                <th>Counts?</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {declineEvents.events.map((ev) => (
                                <tr key={`${ev.submission_id}-${ev.assignment_id || ''}`}>
                                  <td>
                                    <strong>#{ev.submission_id}</strong>
                                    {ev.filename && (
                                      <div style={{ fontSize: 11, color: '#64748b' }}>{ev.filename}</div>
                                    )}
                                  </td>
                                  <td style={{ fontSize: 12 }}>
                                    {ev.declined_at ? new Date(ev.declined_at).toLocaleString() : '—'}
                                  </td>
                                  <td>
                                    <span className="usermgmt-category-chip">{fmtCategory(ev.decline_reason_category)}</span>
                                  </td>
                                  <td style={{ fontSize: 12, maxWidth: 220 }}>
                                    {ev.decline_reason || <span style={{ color: '#94a3b8' }}>—</span>}
                                  </td>
                                  <td>
                                    {ev.waived ? (
                                      <span className="usermgmt-status-pill active" style={{ fontSize: 10 }}>WAIVED</span>
                                    ) : ev.is_countable ? (
                                      <span className="usermgmt-status-pill blocked" style={{ fontSize: 10, background: '#fef3c7', color: '#92400e' }}>YES</span>
                                    ) : (
                                      <span className="usermgmt-status-pill active" style={{ fontSize: 10 }}>NO</span>
                                    )}
                                  </td>
                                  <td>
                                    {!ev.waived && ev.is_countable && (
                                      <button
                                        className="usermgmt-mini-btn"
                                        onClick={() => handleWaive(ev)}
                                        disabled={detailsBusy}
                                        title="Mark this decline as legitimate; it will no longer count toward the pause threshold."
                                      >
                                        Waive
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  )}

                  {/* Inline pause-reason input. */}
                  {isReviewer && pausePrompt.open && (
                    <div className="usermgmt-pause-prompt">
                      <label className="form-label">
                        Reason (optional, included in the reviewer's notification)
                      </label>
                      <textarea
                        className="auth-input-field"
                        value={pausePrompt.reason}
                        onChange={(e) => setPausePrompt({ ...pausePrompt, reason: e.target.value })}
                        placeholder="Internal notes / visible reason."
                      />
                      <div className="usermgmt-details-help" style={{ marginTop: 8 }}>
                        Manual pauses are <strong>not</strong> auto-cleared by the rolling-window sweep —
                        you must unpause explicitly.
                      </div>
                    </div>
                  )}

                  {detailsError && <div className="form-error" style={{ marginTop: 12 }}>{detailsError}</div>}
                </div>

                <div className="dashboard-modal-footer">
                  <button
                    className="dashboard-modal-btn dashboard-modal-btn-secondary"
                    onClick={closeDetails}
                    disabled={detailsBusy}
                  >
                    Close
                  </button>
                  {isReviewer && u.status === 'paused' && (
                    <div className="usermgmt-inline-confirm">
                      <button
                        className="dashboard-modal-btn dashboard-modal-btn-success"
                        onClick={handleRequestUnpause}
                        disabled={detailsBusy}
                      >
                        {detailsBusy ? 'Unpausing…' : 'Unpause Reviewer'}
                      </button>
                      {unpausePromptOpen && (
                        <div className="usermgmt-inline-confirm-actions">
                          <span className="usermgmt-inline-confirm-label">Confirm?</span>
                          <button
                            type="button"
                            className="usermgmt-inline-icon-btn yes"
                            onClick={handleConfirmUnpause}
                            disabled={detailsBusy}
                            title={`Yes, unpause ${u.username}`}
                            aria-label={`Yes, unpause ${u.username}`}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="usermgmt-inline-icon-btn no"
                            onClick={handleCancelUnpause}
                            disabled={detailsBusy}
                            title="No, keep reviewer paused"
                            aria-label="No, keep reviewer paused"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {isReviewer && u.status !== 'paused' && !pausePrompt.open && (
                    <button
                      className="dashboard-modal-btn dashboard-modal-btn-reject"
                      onClick={() => setPausePrompt({ open: true, reason: '' })}
                      disabled={detailsBusy}
                    >
                      Pause Reviewer
                    </button>
                  )}
                  {isReviewer && u.status !== 'paused' && pausePrompt.open && (
                    <>
                      <button
                        className="dashboard-modal-btn dashboard-modal-btn-secondary"
                        onClick={() => setPausePrompt({ open: false, reason: '' })}
                        disabled={detailsBusy}
                      >
                        Cancel Pause
                      </button>
                      <button
                        className="dashboard-modal-btn dashboard-modal-btn-danger"
                        onClick={handleConfirmPause}
                        disabled={detailsBusy}
                      >
                        {detailsBusy ? 'Pausing…' : 'Confirm Pause'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}

export default UserManagement;
