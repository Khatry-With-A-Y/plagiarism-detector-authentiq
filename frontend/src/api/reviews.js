import api from './api';

export const reviewsAPI = {
    // --- User: review requests ---
    getMyRequests: () => api.get('/reviews/requests/my'),
    checkEligibility: (submissionId) => api.get(`/reviews/submissions/${submissionId}/eligibility`),
    requestReview: (submissionId, domainTag = 'CS') => api.post('/reviews/requests', {
        submission_id: submissionId,
        domain_tag: domainTag
    }),

    // --- Admin: queue & assignment ---
    adminGetQueue: (status, page = 1, limit = 50) => {
        let url = `/reviews/admin/queue?page=${page}&limit=${limit}`;
        if (status) url += `&status=${status}`;
        return api.get(url);
    },
    adminAssign: (submissionId) =>
        api.post(`/reviews/admin/submissions/${submissionId}/assign`),
    adminGetSubmissionDetail: (submissionId) =>
        api.get(`/reviews/admin/submissions/${submissionId}`),

    // --- Block 6: Admin Finalize / Promotion Pipeline ---
    // payload: { decision: 'approve' | 'reject', reason?, title?, author?, force? }
    adminDecide: (submissionId, payload) =>
        api.post(`/reviews/admin/submissions/${submissionId}/decision`, payload),

    // --- Reviewer: assignments ---
    // Block 7: optional `status` filter — one of pending|completed|declined_expired
    listAssignments: (page = 1, pageSize = 50, status = null) => {
        let url = `/reviews/assignments?page=${page}&page_size=${pageSize}`;
        if (status) url += `&status=${status}`;
        return api.get(url);
    },
    getAssignment: (submissionId) =>
        api.get(`/reviews/assignments/${submissionId}`),
    submitVote: (submissionId, vote, comment, failReasons) =>
        api.post(`/reviews/assignments/${submissionId}/vote`, {
            vote,
            comment,
            fail_reasons: failReasons,
        }),
    // --- Block 5: Assignment lifecycle ---
    acceptAssignment: (submissionId) =>
        api.post(`/reviews/assignments/${submissionId}/accept`),
    declineAssignment: (submissionId, declineReason = null) =>
        api.post(`/reviews/assignments/${submissionId}/decline`, {
            decline_reason: declineReason,
        }),
    getAssignmentsSummary: () =>
        api.get('/reviews/assignments/summary'),

    // Block 7: admin variant for the navbar badge
    adminGetRequestsSummary: () =>
        api.get('/reviews/admin/requests/summary'),

    // Block 7 (Stage 7b): submitter post-decision view — pseudonymous panel
    getSubmissionPanel: (submissionId) =>
        api.get(`/reviews/submissions/${submissionId}/panel`),
};

export default reviewsAPI;
