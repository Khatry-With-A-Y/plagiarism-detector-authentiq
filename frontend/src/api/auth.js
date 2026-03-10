import api from './api';

export const register = (username, email, password) =>
  api.post('/auth/register', { username, email, password });

export const login = (username, password) =>
  api.post('/auth/login', { username, password });

export const getCurrentUser = () => api.get('/auth/me');

// for convenience we can also export an object
export const authAPI = { register, login, getCurrentUser };
