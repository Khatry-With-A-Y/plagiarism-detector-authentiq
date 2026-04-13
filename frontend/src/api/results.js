import api from './api';

export const submissionsAPI = {
  upload: (formData) => {
    return api.post('/submissions/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getAll: () => api.get('/submissions'),

  getResults: (submissionId) => api.get(`/submissions/${submissionId}/results`),

  process: (submissionId) => api.post(`/process/${submissionId}`),

  delete: (submissionId) => api.delete(`/submissions/${submissionId}`),
  updateFilename: (submissionId, filename) => api.put(`/submissions/${submissionId}/filename`, { filename }),
};

export const corpusAPI = {
  upload: (file, title, author) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (author) formData.append('author', author);
    return api.post('/corpus/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getAll: (page = 1, limit = 10, search = '') => {
    let url = `/corpus?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return api.get(url);
  },

  delete: (paperId) => api.delete(`/corpus/${paperId}`),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getCorpusGrowth: (timeframe = 'week') => api.get(`/admin/corpus-growth?timeframe=${timeframe}`),
  getProcessingTime: () => api.get('/admin/processing-time'),
  getUsers: () => api.get('/auth/users'),
  toggleUserStatus: (userId) => api.put(`/auth/users/${userId}/toggle-status`),
};

// optionally export a default object combining both
export default { submissionsAPI, corpusAPI, adminAPI };
