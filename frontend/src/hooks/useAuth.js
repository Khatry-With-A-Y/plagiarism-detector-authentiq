import { useState, useEffect, useCallback } from 'react';
import { register as apiRegister, login as apiLogin } from '../api/auth';
import {
  setAuthToken,
  setUser as storeUser,
  getUser as getStoredUser,
  logout as clearStorage,
} from '../utils/auth';

// hook that exposes authentication helpers and current user
export default function useAuth() {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    // keep localStorage and state in sync
    const stored = getStoredUser();
    if (stored && stored !== user) {
      setUser(stored);
    }
  }, [user]);

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

  const isAdmin = user?.role === 'admin';
  const isAuthenticated = !!user;

  return { user, login, register, logout, isAdmin, isAuthenticated };
}
