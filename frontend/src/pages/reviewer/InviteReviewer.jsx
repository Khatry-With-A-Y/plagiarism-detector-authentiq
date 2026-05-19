import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import { setAuthToken, setUser, logout as clearAuth } from '../../utils/auth';
import '../dashboard.css';
import '../auth.css';

function InviteReviewer() {
  const navigate = useNavigate();
  const [state, setState] = useState('loading'); // loading | needs_profile | completed | mismatch | error
  const [errorMsg, setErrorMsg] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [completedSubmissionId, setCompletedSubmissionId] = useState(null);
  const [completedReportPath, setCompletedReportPath] = useState('');
  const [completedDashboardPath, setCompletedDashboardPath] = useState('/dashboard');
  const [currentEmail, setCurrentEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requestedRef = useRef(false);

  const token = (new URLSearchParams(window.location.search).get('token') || '').trim();

  const consumeInvite = (profileOverride = null) => {
    if (!token) {
      setState('error');
      setErrorMsg('No invitation token was found in the URL.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    reviewsAPI
      .consumeInvite(
        token,
        profileOverride?.username || null,
        profileOverride?.password || null,
        profileOverride?.bio ?? null
      )
      .then((res) => {
        const data = res.data || {};
        if (data.needs_profile) {
          setInvitedEmail(data.invited_email || '');
          setState('needs_profile');
          return;
        }
        if (data.already_completed) {
          const submissionId = data.submission_id || null;
          setCompletedSubmissionId(submissionId);
          setCompletedReportPath(
            data.report_path || (submissionId ? `/reviewer/assignments/${submissionId}` : '/reviewer')
          );
          setCompletedDashboardPath(data.dashboard_path || '/dashboard');
          setState('completed');
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
        if (profileOverride?.username) {
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
    if (!bio.trim()) {
      setErrorMsg('Please enter your short biography to continue.');
      return;
    }
    if (bio.length > 2000) {
      setErrorMsg('Bio must be under 2000 characters.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter a password to continue.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (!confirmPassword) {
      setErrorMsg('Please confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    consumeInvite({ username: username.trim(), password, bio: bio.trim() });
  };

  const handleSwitchAccount = () => {
    clearAuth();
    setState('loading');
    consumeInvite();
  };

  const handleOpenCompletedReport = () => {
    navigate(
      completedReportPath ||
      (completedSubmissionId ? `/reviewer/assignments/${completedSubmissionId}` : '/reviewer')
    );
  };

  const handleOpenDashboard = () => {
    navigate(completedDashboardPath || '/dashboard');
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
          <h2 style={{ marginBottom: '8px' }}>Looks like it&apos;s your first time here!</h2>
          <p style={{ color: '#374151', marginTop: '4px' }}>
            This invite is for <strong>{invitedEmail || 'your institutional email'}</strong>.
            Please choose a username, password, and short biography to finish your first-time setup.
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
            <label className="auth-input-label" style={{ marginTop: '12px', display: 'block' }}>Password</label>
            <input
              type="password"
              className="auth-input-field"
              placeholder="Enter a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />
            <label className="auth-input-label" style={{ marginTop: '12px', display: 'block' }}>Confirm Password</label>
            <input
              type="password"
              className="auth-input-field"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />
            <label className="auth-input-label" style={{ marginTop: '12px', display: 'block' }}>Short Biography / Credentials</label>
            <textarea
              className="auth-input-field"
              style={{ minHeight: '140px', padding: '14px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder="Briefly describe your academic background, research interests, and expertise..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              disabled={submitting}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <p className="apply-help-text">
                Markdown is not supported. Plain text only.
              </p>
              <span
                className={
                  'apply-help-text' +
                  (bio.length > 2000 ? ' error' : '')
                }
              >
                {bio.length} / 2000
              </span>
            </div>
            {errorMsg && (
              <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px' }}>{errorMsg}</p>
            )}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                className="dashboard-btn-primary"
                onClick={handleSubmitProfile}
                disabled={submitting || bio.length > 2000}
              >
                {submitting ? 'Saving…' : 'Continue to review'}
              </button>
            </div>
          </div>
        </>
      )}

      {state === 'completed' && (
        <>
          <h2 style={{ marginBottom: '8px' }}>You&apos;re all set!</h2>
          <p style={{ color: '#374151', marginTop: '4px' }}>
            This invitation has already been completed.
            You can continue from your dashboard or open the assigned report directly.
          </p>
          <div
            style={{
              marginTop: '20px',
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <button className="dashboard-btn-primary" onClick={handleOpenCompletedReport}>
              Go to report
            </button>
            <button className="dashboard-view-link" onClick={handleOpenDashboard}>
              Go to main dashboard
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
