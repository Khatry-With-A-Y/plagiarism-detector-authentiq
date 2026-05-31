import { useState, useEffect, useCallback } from 'react';
import { 
  register as apiRegister, 
  login as apiLogin, 
  getCurrentUser as apiGetCurrentUser,
  refresh as apiRefresh,
  logout as apiLogout
} from '../api/auth';
import { setAccessToken } from '../api/api';
import {
  setUser as storeUser,
  getUser as getStoredUser,
  logout as clearStorage,
} from '../utils/auth';

// hook that exposes authentication helpers and current user
export default function useAuth() {
  const [user, setUser] = useState(() => getStoredUser());
  const [isInitializing, setIsInitializing] = useState(true);

  const silentRefresh = useCallback(async () => {
    try {
      const res = await apiRefresh();
      const token = res.data.token;
      setAccessToken(token);
      
      // After refreshing token, fetch fresh user data
      const userRes = await apiGetCurrentUser();
      const userData = userRes.data;
      storeUser(userData);
      setUser(userData);
    } catch (err) {
      // Refresh failed or no refresh token - clear any stale data
      setAccessToken('');
      clearStorage();
      setUser(null);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    silentRefresh();
  }, [silentRefresh]);

  const login = useCallback(async (username, password, rememberMe = false) => {
    const res = await apiLogin(username, password, rememberMe);
    const token = res.data.token;
    const userData = res.data.user;
    setAccessToken(token);
    storeUser(userData);
    setUser(userData);
    return res;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const res = await apiRegister(username, email, password);
    const token = res.data.token;
    const userData = res.data.user;
    setAccessToken(token);
    storeUser(userData);
    setUser(userData);
    return res;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error("Logout request failed:", err);
    }
    setAccessToken('');
    clearStorage();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiGetCurrentUser();
      const userData = res.data;
      storeUser(userData);
      setUser(userData);
      return userData;
    } catch (err) {
      console.error("Failed to refresh user info:", err);
    }
  }, []);

  const isAdmin = user?.role === 'admin';
  const isReviewer = user?.role === 'reviewer';
  const isAuthenticated = !!user;

  return { 
    user, 
    login, 
    register, 
    logout, 
    refreshUser, 
    isAdmin, 
    isReviewer, 
    isAuthenticated,
    isInitializing 
  };
}
