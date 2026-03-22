import React from 'react';
import useAuth from '../hooks/useAuth';
import AdminDashboard from './admin/AdminDashboard';
import UserDashboard from './user/UserDashboard';

function Dashboard() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <UserDashboard />;
}

export default Dashboard;
