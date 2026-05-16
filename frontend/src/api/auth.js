import api from './api';

export const register = (username, email, password) =>
  api.post('/auth/register', { username, email, password });

export const login = (username, password) =>
  api.post('/auth/login', { username, password });

export const getCurrentUser = () => api.get('/auth/me');

export const updatePassword = (currentPassword, newPassword) =>
  api.put('/auth/me/password', { current_password: currentPassword, new_password: newPassword });

export const uploadAvatar = (formData) =>
  api.put('/auth/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const deleteAvatar = () => api.delete('/auth/me/avatar');

export const updateBio = (bio) => api.put('/auth/me/bio', { bio });

// for convenience we can also export an object
export const authAPI = {
  register,
  login,
  getCurrentUser,
  updatePassword,
  uploadAvatar,
  deleteAvatar,
  updateBio,
};
