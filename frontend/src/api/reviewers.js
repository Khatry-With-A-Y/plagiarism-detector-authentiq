import api from './api';

export const reviewersAPI = {
  getInstitutions: () => api.get('/reviewers/institutions'),
  
  apply: (data) => api.post('/reviewers/apply', data),

  // Consume an institutional-email verification token. Called from the
  // /reviewer/verify-email page after the user clicks the link in their
  // institutional inbox.
  verifyEmail: (token) => api.post('/reviewers/verify-email', { token }),

  // Re-send the institutional-email verification link. Server enforces a
  // 60s cooldown and a 5/24h cap; on quota errors the response is 429 with
  // a `retry_after` field (seconds) that the UI uses to disable the button.
  resendVerification: () =>
    api.post('/reviewers/applications/my/resend-verification'),

  // Let the applicant fix a wrong institutional email on a pending
  // application. Backend rotates the verification token, sends a fresh
  // link, and counts the send against the resend quota.
  updateApplicationEmail: (institutionalEmail) =>
    api.put('/reviewers/applications/my/email', {
      institutional_email: institutionalEmail,
    }),

  getMyApplication: () => api.get('/reviewers/applications/my'),
  
  adminListApplications: (status, page = 1) => {
    let url = `/reviewers/admin/applications?page=${page}`;
    if (status) url += `&status=${status}`;
    return api.get(url);
  },
  
  adminDecide: (userId, decision, reason) => {
    return api.post(`/reviewers/admin/applications/${userId}/decision`, { decision, reason });
  },

  // Block 7 (Stage 7c): admin revokes a reviewer's status. Historical
  // assignments stay intact; the user's role flips back to 'user'.
  adminRevoke: (userId, reason) =>
    api.post(`/reviewers/admin/${userId}/revoke`, { reason }),
};

export default reviewersAPI;
