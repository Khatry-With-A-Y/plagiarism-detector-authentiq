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
    // synchronize once with localStorage on mount
    const stored = getStoredUser();
    // only update if the stored user differs in content (not just reference)
    if (stored && JSON.stringify(stored) !== JSON.stringify(user)) {
      setUser(stored);
    }
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

  const isAdmin = user?.role === 'admin';
  const isAuthenticated = !!user;

  return { user, login, register, logout, isAdmin, isAuthenticated };
}
