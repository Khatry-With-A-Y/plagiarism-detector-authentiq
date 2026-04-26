import api from './api';

export const reviewersAPI = {
  getInstitutions: () => api.get('/reviewers/institutions'),
  
  apply: (data) => api.post('/reviewers/apply', data),
  
  getMyApplication: () => api.get('/reviewers/applications/my'),
  
  adminListApplications: (status, page = 1) => {
    let url = `/reviewers/admin/applications?page=${page}`;
    if (status) url += `&status=${status}`;
    return api.get(url);
  },
  
  adminDecide: (userId, decision, reason) => {
    return api.post(`/reviewers/admin/applications/${userId}/decision`, { decision, reason });
  }
};

export default reviewersAPI;
