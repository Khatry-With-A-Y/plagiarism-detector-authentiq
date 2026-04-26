import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { adminAPI } from '../../api/results';
import '../dashboard.css';
import './userManagement.css';

function UserManagement({ isEmbedded = false }) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await adminAPI.getUsers();
        setUsersList(response.data.users || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // Calculate max activity for normalization
  const maxActivity = usersList.length > 0 ? Math.max(...usersList.map(u => u.activity || 0)) : 1;

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
    if (usersList.length > 0 && selectedUsers.length === usersList.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(usersList.map(u => u.id));
    }
  };

  const handleToggleStatus = async (userId, currentRole) => {
    if (currentRole === 'admin') return; // Cannot modify admin
    try {
      const response = await adminAPI.toggleUserStatus(userId);
      const newStatus = response.data.status;
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    } catch (error) {
      console.error('Failed to toggle user status:', error);
      alert('Failed to update user status');
    }
  };

  return (
    <div className="dashboard">
      {/* Navbar */}
      {!isEmbedded && (
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
            <div className="dashboard-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
              <img src="https://ui-avatars.com/api/?name=Admin&background=1e40af&color=fff" alt="User" />
            </div>
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
        <div className="usermgmt-header">
          <h1>User Management</h1>
          <p>Manage accounts, roles, and platform activity logs.</p>
        </div>

        {/* Filters */}
        <div className="usermgmt-filters">
          <div className="usermgmt-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
            <input type="text" placeholder="Search name or email address" />
          </div>
          <button className="usermgmt-filter-dropdown">
            Role: All
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button className="usermgmt-filter-dropdown">
            Status: All
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
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
                    checked={usersList.length > 0 && selectedUsers.length === usersList.length}
                    onChange={toggleAllUsers}
                  />
                </th>
                <th>User Name</th>
                <th>Role</th>
                <th>Registered Date</th>
                <th>Activity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Loading users...</td>
                </tr>
              ) : usersList.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No users found.</td>
                </tr>
              ) : (
                usersList.map((userItem) => (
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
                        <img
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userItem.username || 'User')}&background=${userItem.role === 'admin' ? '1e40af' : userItem.role === 'reviewer' ? '166534' : '6b7280'}&color=fff`}
                          alt={userItem.username}
                          className="usermgmt-avatar"
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
                      <div className="usermgmt-activity">
                        <div className="usermgmt-activity-bar">
                          <div
                            className="usermgmt-activity-fill"
                            style={{ width: `${((userItem.activity || 0) / maxActivity) * 100}%` }}
                          ></div>
                        </div>
                        <span className="usermgmt-activity-count">{userItem.activity || 0}</span>
                      </div>
                    </td>
                    <td>
                      <div 
                        className={`usermgmt-toggle-wrapper ${userItem.role === 'admin' ? 'disabled' : ''}`}
                        onClick={() => handleToggleStatus(userItem.id, userItem.role)}
                        style={{ cursor: userItem.role === 'admin' ? 'not-allowed' : 'pointer', opacity: userItem.role === 'admin' ? 0.5 : 1 }}
                      >
                        <div className={`usermgmt-toggle ${userItem.status === 'active' ? 'active' : ''}`}></div>
                      </div>
                    </td>
                    <td>
                    <div className="usermgmt-actions">
                      <button className="usermgmt-action-btn" title="View Details">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </button>
                      <button className="usermgmt-action-btn" title="More Options">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="12" cy="5" r="1"></circle>
                          <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="usermgmt-pagination">
            <span className="usermgmt-pagination-info">
              {usersList.length > 0 ? `1-${usersList.length} of ${usersList.length} users` : '0 users'}
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
      </main>
    </div>
  );
}

export default UserManagement;
