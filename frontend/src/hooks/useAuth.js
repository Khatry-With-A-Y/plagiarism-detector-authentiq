import { useState, useEffect, useCallback } from 'react';
import { register as apiRegister, login as apiLogin, getCurrentUser as apiGetCurrentUser } from '../api/auth';
import {
  getAuthToken,
  setAuthToken,
  setUser as storeUser,
  getUser as getStoredUser,
  logout as clearStorage,
} from '../utils/auth';

// hook that exposes authentication helpers and current user
export default function useAuth() {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    // synchronize once with localStorage on mount
    const stored = getStoredUser();
    // only update if the stored user differs in content (not just reference)
    if (stored && JSON.stringify(stored) !== JSON.stringify(user)) {
      setUser(stored);
    }
    // refresh current user from backend to capture role/status changes made server-side
    if (!getAuthToken()) return;

    let cancelled = false;
    apiGetCurrentUser()
      .then((res) => {
        const userData = res.data;
        if (!cancelled && JSON.stringify(userData) !== JSON.stringify(stored)) {
          storeUser(userData);
          setUser(userData);
        }
      })
      .catch(() => {
        // best effort; keep current local state on transient failures
      });

    return () => {
      cancelled = true;
    };
    // we intentionally run this only once; further updates go through login/logout
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await apiLogin(username, password);
    const token = res.data.token;
    const userData = res.data.user;
    setAuthToken(token);
    storeUser(userData);
    setUser(userData);
    return res;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const res = await apiRegister(username, email, password);
    const token = res.data.token;
    const userData = res.data.user;
    setAuthToken(token);
    storeUser(userData);
    setUser(userData);
    return res;
  }, []);

  const logout = useCallback(() => {
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

  return { user, login, register, logout, refreshUser, isAdmin, isReviewer, isAuthenticated };
}
