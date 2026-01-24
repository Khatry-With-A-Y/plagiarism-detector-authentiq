import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
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
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (username, email, password) =>
    api.post('/auth/register', { username, email, password }),
  
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
  
  getCurrentUser: () =>
    api.get('/auth/me'),
};

// Submissions API
export const submissionsAPI = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/submissions/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  getAll: () =>
    api.get('/submissions'),
  
  getResults: (submissionId) =>
    api.get(`/submissions/${submissionId}/results`),
  
  process: (submissionId) =>
    api.post(`/process/${submissionId}`),
};

// Corpus API
export const corpusAPI = {
  upload: (file, title, author) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (author) formData.append('author', author);
    return api.post('/corpus/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  getAll: () =>
    api.get('/corpus'),
  
  delete: (paperId) =>
    api.delete(`/corpus/${paperId}`),
};

export default api;
