import api from './api';

export const notificationsAPI = {
  getAll: (limit = 20) => api.get(`/notifications?limit=${limit}`),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
  getUserNotificationsForAdmin: (userId) => api.get(`/notifications/admin/user/${userId}`)
};

export default notificationsAPI;
