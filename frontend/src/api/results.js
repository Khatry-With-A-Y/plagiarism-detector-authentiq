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

  getAll: () => api.get('/corpus'),

  delete: (paperId) => api.delete(`/corpus/${paperId}`),
};

// optionally export a default object combining both
export default { submissionsAPI, corpusAPI };
