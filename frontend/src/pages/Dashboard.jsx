import React from 'react';
import useAuth from '../hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import UserDashboard from './UserDashboard';

function Dashboard() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <UserDashboard />;
}

export default Dashboard;
