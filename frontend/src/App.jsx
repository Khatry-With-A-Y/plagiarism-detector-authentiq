import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import useAuth from './hooks/useAuth';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Results from './pages/user/Results';
import UserStatistics from './pages/user/UserStatistics';
import CorpusManagement from './pages/admin/CorpusManagement';
import UserManagement from './pages/admin/UserManagement';
import ApplyReviewer from './pages/reviewer/ApplyReviewer';
import VerifyEmail from './pages/reviewer/VerifyEmail';
import InviteReviewer from './pages/reviewer/InviteReviewer';
import ReviewerDashboard from './pages/reviewer/ReviewerDashboard';
import ReviewDetail from './pages/reviewer/ReviewDetail';
import UserProfile from './pages/user/UserProfile';
import './index.css';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) return null;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Admin Route component
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isAdmin, isInitializing } = useAuth();
  if (isInitializing) return null;
  return isAuthenticated && isAdmin ? children : <Navigate to="/dashboard" />;
};

// Reviewer Route component — allows reviewer and admin roles
const ReviewerRoute = ({ children }) => {
  const { isAuthenticated, isReviewer, isAdmin, isInitializing } = useAuth();

  if (isInitializing) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;
  return (isReviewer || isAdmin) ? children : <Navigate to="/dashboard" />;
};

function App() {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: '#fff' 
      }}>
        <div className="loading-spinner" style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(0,0,0,0.1)',
          borderTopColor: '#000',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

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
          <Route path="/reviewer/invite" element={<InviteReviewer />} />
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
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Landing />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
