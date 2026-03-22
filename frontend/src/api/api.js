import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with default headers
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthEndpoint = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const isBlocked = error.response.data?.error === 'Account is blocked';
      window.location.href = isBlocked ? '/login?error=blocked' : '/login';
    } else if (!error.response && error.message === 'Network Error' && localStorage.getItem('token') && !isAuthEndpoint) {
      // If server resets connection (e.g. 401 during file upload), check auth status
      axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).catch(err => {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          const isBlocked = err.response.data?.error === 'Account is blocked';
          window.location.href = isBlocked ? '/login?error=blocked' : '/login';
        }
      });
    }
    return Promise.reject(error);
  }
);

export default api;