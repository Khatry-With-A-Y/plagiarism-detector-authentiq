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
    adminCreateInvite: (submissionId, institutionalEmail, force = false) =>
        api.post('/reviews/admin/invitations', {
            submission_id: submissionId,
            institutional_email: institutionalEmail,
            force,
        }),
    adminResendInvite: (inviteId) =>
        api.post(`/reviews/admin/invitations/${inviteId}/resend`),
    adminListInvites: (submissionId) =>
        api.get(`/reviews/admin/invitations?submission_id=${submissionId}`),

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
    // Stage 1: stream the original uploaded PDF for an active assignment.
    // Bearer-token auth flows through the shared `api` axios instance, so the
    // caller converts the blob to an object URL and embeds it in an iframe.
    getAssignmentFile: (submissionId) =>
        api.get(`/reviews/assignments/${submissionId}/file`, {
            responseType: 'blob',
        }),
    submitVote: (submissionId, vote, comment, failReasons) =>
        api.post(`/reviews/assignments/${submissionId}/vote`, {
            vote,
            comment,
            fail_reasons: failReasons,
        }),
    // --- Block 5: Assignment lifecycle ---
    acceptAssignment: (submissionId) =>
        api.post(`/reviews/assignments/${submissionId}/accept`),
    // Decline-handling accountability layer: optional structured category.
    // Categories `conflict_of_interest` and `out_of_expertise` are excluded
    // from the rolling-window pause threshold. See
    // .junie/plans/decline-handling-implementation.md.
    declineAssignment: (submissionId, declineReason = null, declineReasonCategory = null) =>
        api.post(`/reviews/assignments/${submissionId}/decline`, {
            decline_reason: declineReason,
            decline_reason_category: declineReasonCategory,
        }),
    getAssignmentsSummary: () =>
        api.get('/reviews/assignments/summary'),

    // Reviewer invitation magic-link consumption.
    consumeInvite: (token, username = null, password = null, bio = null) => {
        const payload = { token };
        if (username) payload.username = username;
        if (password) payload.password = password;
        if (bio !== null) payload.bio = bio;
        return api.post('/reviews/invitations/consume', payload);
    },

    // Block 7: admin variant for the navbar badge
    adminGetRequestsSummary: () =>
        api.get('/reviews/admin/requests/summary'),

    // Block 7 (Stage 7b): submitter post-decision view — pseudonymous panel
    getSubmissionPanel: (submissionId) =>
        api.get(`/reviews/submissions/${submissionId}/panel`),

    // Admin waives a single decline JSON entry inside a submission's
    // `review_votes`. If the reviewer was auto-paused and the waiver
    // drops them below the hard limit, they are unpaused atomically in
    // the same transaction.
    adminWaiveDeclineEvent: (submissionId, reviewerId) =>
        api.post(
            `/reviews/admin/submissions/${submissionId}/decline-events/${reviewerId}/waive`
        ),
};

export default reviewsAPI;
