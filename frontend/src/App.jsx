import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, isAdmin as checkAdmin } from './utils/auth';
import { getCurrentUser as apiGetCurrentUser } from './api/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Results from './pages/user/Results';
import UserStatistics from './pages/user/UserStatistics';
import CorpusManagement from './pages/admin/CorpusManagement';
import UserManagement from './pages/admin/UserManagement';
import ApplyReviewer from './pages/reviewer/ApplyReviewer';
import VerifyEmail from './pages/reviewer/VerifyEmail';
import ReviewerDashboard from './pages/reviewer/ReviewerDashboard';
import ReviewDetail from './pages/reviewer/ReviewDetail';
import './index.css';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/login" />;
};

// Admin Route component
const AdminRoute = ({ children }) => {
  return isAuthenticated() && checkAdmin() ? children : <Navigate to="/dashboard" />;
};

// Reviewer Route component — allows reviewer and admin roles
const ReviewerRoute = ({ children }) => {
  const [checkingRole, setCheckingRole] = useState(true);
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      setCheckingRole(false);
      setCanAccess(false);
      return;
    }

    let cancelled = false;

    try {
      const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (cachedUser.role === 'reviewer' || cachedUser.role === 'admin') {
        setCanAccess(true);
        setCheckingRole(false);
        return;
      }
    } catch {
      // Ignore malformed local cache and fall back to /auth/me.
    }

    apiGetCurrentUser()
      .then((res) => {
        const freshUser = res.data || {};
        localStorage.setItem('user', JSON.stringify(freshUser));
        if (!cancelled) {
          setCanAccess(freshUser.role === 'reviewer' || freshUser.role === 'admin');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanAccess(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingRole(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAuthenticated()) return <Navigate to="/login" />;
  if (checkingRole) return null;
  return canAccess ? children : <Navigate to="/dashboard" />;
};

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/results/:id"
            element={
              <ProtectedRoute>
                <Results />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-statistics"
            element={
              <ProtectedRoute>
                <UserStatistics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviewer/apply"
            element={
              <ProtectedRoute>
                <ApplyReviewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviewer/verify-email"
            element={
              <ProtectedRoute>
                <VerifyEmail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviewer"
            element={
              <ReviewerRoute>
                <ReviewerDashboard />
              </ReviewerRoute>
            }
          />
          <Route
            path="/reviewer/assignments/:submissionId"
            element={
              <ReviewerRoute>
                <ReviewDetail />
              </ReviewerRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <CorpusManagement />
              </AdminRoute>
            }
          />
          <Route
            path="/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
          <Route path="/" element={<Landing />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
