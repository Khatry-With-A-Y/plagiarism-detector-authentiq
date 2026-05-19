import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import { setAuthToken, setUser, logout as clearAuth } from '../../utils/auth';
import '../dashboard.css';
import '../auth.css';

function InviteReviewer() {
  const navigate = useNavigate();
  const [state, setState] = useState('loading'); // loading | needs_profile | mismatch | error
  const [errorMsg, setErrorMsg] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requestedRef = useRef(false);

  const token = (new URLSearchParams(window.location.search).get('token') || '').trim();

  const consumeInvite = (usernameOverride = null) => {
    if (!token) {
      setState('error');
      setErrorMsg('No invitation token was found in the URL.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    reviewsAPI
      .consumeInvite(token, usernameOverride)
      .then((res) => {
        const data = res.data || {};
        if (data.needs_profile) {
          setInvitedEmail(data.invited_email || '');
          setState('needs_profile');
          return;
        }
        if (data.token && data.user) {
          setAuthToken(data.token);
          setUser(data.user);
          navigate(`/reviewer/assignments/${data.submission_id}`);
          return;
        }
        setState('error');
        setErrorMsg('Unexpected invitation response.');
      })
      .catch((err) => {
        const code = err?.response?.data?.code;
        if (code === 'INVITE_ACCOUNT_MISMATCH') {
          setInvitedEmail(err?.response?.data?.invited_email || '');
          setCurrentEmail(err?.response?.data?.current_email || '');
          setState('mismatch');
          return;
        }
        const apiError = err?.response?.data?.error;
        if (usernameOverride) {
          setState('needs_profile');
          setErrorMsg(apiError || 'We could not save that username. Please try another or contact support.');
          return;
        }
        setState('error');
        setErrorMsg(
          apiError ||
          "We couldn't verify this invitation link. It may be invalid or expired."
        );
      })
      .finally(() => setSubmitting(false));
  };

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    consumeInvite();
  }, []);

  const handleSubmitProfile = () => {
    if (!username.trim()) {
      setErrorMsg('Please enter a username to continue.');
      return;
    }
    consumeInvite(username.trim());
  };

  const handleSwitchAccount = () => {
    clearAuth();
    setState('loading');
    consumeInvite();
  };

  const card = (
    <div
      className="dashboard-card"
      style={{
        textAlign: 'center',
        padding: '40px',
        maxWidth: '560px',
        margin: '60px auto',
      }}
    >
      {state === 'loading' && (
        <>
          <h2 style={{ marginBottom: '8px' }}>Opening your invitation…</h2>
          <p style={{ color: '#64748b' }}>One moment, please.</p>
        </>
      )}

      {state === 'needs_profile' && (
        <>
          <h2 style={{ marginBottom: '8px' }}>Welcome, Reviewer!</h2>
          <p style={{ color: '#374151', marginTop: '4px' }}>
            This invite is for <strong>{invitedEmail || 'your institutional email'}</strong>.
            Please choose a username to finish setup.
          </p>
          <div style={{ marginTop: '20px', textAlign: 'left' }}>
            <label className="auth-input-label">Username</label>
            <input
              type="text"
              className="auth-input-field"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
            {errorMsg && (
              <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px' }}>{errorMsg}</p>
            )}
            <button
              className="dashboard-btn-primary"
              style={{ width: '100%', marginTop: '16px' }}
              onClick={handleSubmitProfile}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Continue to review'}
            </button>
          </div>
        </>
      )}

      {state === 'mismatch' && (
        <>
          <div
            className="dashboard-risk-badge high"
            style={{ marginBottom: '16px', display: 'inline-flex' }}
          >
            Account mismatch
          </div>
          <h2 style={{ marginBottom: '8px' }}>This invite belongs to another account</h2>
          <p style={{ color: '#374151', marginTop: '4px' }}>
            You are logged in as <strong>{currentEmail || 'another account'}</strong>, but
            this invitation is for <strong>{invitedEmail || 'a different email'}</strong>.
          </p>
          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="dashboard-view-link"
              style={{ display: 'inline-flex' }}
              onClick={handleSwitchAccount}
              disabled={submitting}
            >
              Switch account
            </button>
            <button
              className="dashboard-view-link"
              style={{ display: 'inline-flex' }}
              onClick={() => navigate('/dashboard')}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <div
            className="dashboard-risk-badge high"
            style={{ marginBottom: '16px', display: 'inline-flex' }}
          >
            Invitation failed
          </div>
          <h2 style={{ marginBottom: '8px' }}>We couldn't open this invite</h2>
          <p style={{ color: '#374151', marginTop: '4px' }}>{errorMsg}</p>
          <button
            className="dashboard-view-link"
            style={{ display: 'inline-flex', marginTop: '20px' }}
            onClick={() => navigate('/dashboard')}
          >
            Go to dashboard
          </button>
        </>
      )}
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        background: '#f8fafc',
      }}
    >
      {card}
    </div>
  );
}

export default InviteReviewer;
