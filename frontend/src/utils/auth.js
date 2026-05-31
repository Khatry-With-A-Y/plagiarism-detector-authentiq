import { getAccessToken, setAccessToken } from '../api/api';

export const setUser = (user) => {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
};

export const getUser = () => {
  const userStr = localStorage.getItem('user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
};

export const isAuthenticated = () => {
  return !!getAccessToken();
};

export const isAdmin = () => {
  const user = getUser();
  return user?.role === 'admin';
};

export const logout = () => {
  setAccessToken('');
  localStorage.removeItem('user');
};
