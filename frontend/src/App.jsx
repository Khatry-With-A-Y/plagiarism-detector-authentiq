import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, isAdmin as checkAdmin } from './utils/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Results from './pages/user/Results';
import UserStatistics from './pages/user/UserStatistics';
import CorpusManagement from './pages/admin/CorpusManagement';
import UserManagement from './pages/admin/UserManagement';
import ApplyReviewer from './pages/reviewer/ApplyReviewer';
import './index.css';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/login" />;
};

// Admin Route component
const AdminRoute = ({ children }) => {
  return isAuthenticated() && checkAdmin() ? children : <Navigate to="/dashboard" />;
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
