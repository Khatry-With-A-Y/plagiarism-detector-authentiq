import api from './api';

export const reviewsAPI = {
    getMyRequests: () => api.get('/reviews/requests/my'),
    checkEligibility: (submissionId) => api.get(`/reviews/submissions/${submissionId}/eligibility`),
    requestReview: (submissionId, domainTag = 'CS') => api.post('/reviews/requests', { 
        submission_id: submissionId,
        domain_tag: domainTag 
    }),
    adminGetQueue: (status, page = 1, limit = 50) => {
        let url = `/reviews/admin/queue?page=${page}&limit=${limit}`;
        if (status) url += `&status=${status}`;
        return api.get(url);
    }
};

export default reviewsAPI;
