import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import Avatar from '../../components/Avatar';
import Logo from '../../components/Logo';
import reviewersAPI from '../../api/reviewers';
import {
  uploadAvatar,
  deleteAvatar,
  updateBio,
  updatePassword,
} from '../../api/auth';
import '../dashboard.css';
import './userProfile.css';

const BACKEND_ORIGIN = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:5000';

function formatDate(iso) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getAvatarSrc(avatarUrl, previewSrc) {
  if (previewSrc) return previewSrc;
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return avatarUrl;
  return `${BACKEND_ORIGIN}${avatarUrl}`;
}

/* ─── ProfileHero ─────────────────────────────────────────────────── */
function ProfileHero({ user, onAvatarUploaded, onAvatarDeleted }) {
  const [previewSrc, setPreviewSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef(null);

  const avatarSrc = getAvatarSrc(user?.avatar_url, previewSrc);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    setAvatarError('');

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setAvatarError('Unsupported file type. Please use JPEG, PNG, or WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('File must be under 2 MB.');
      return;
    }

    // Optimistic preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewSrc(objectUrl);

    const formData = new FormData();
    formData.append('avatar', file);
    setUploading(true);
    uploadAvatar(formData)
      .then((res) => {
        URL.revokeObjectURL(objectUrl);
        setPreviewSrc(null);
        onAvatarUploaded(res.data.user);
      })
      .catch((err) => {
        URL.revokeObjectURL(objectUrl);
        setPreviewSrc(null);
        const msg = err.response?.data?.error || 'Upload failed. Please try again.';
        setAvatarError(msg);
      })
      .finally(() => setUploading(false));
  }

  function handleRemove() {
    setAvatarError('');
    setRemoving(true);
    deleteAvatar()
      .then((res) => onAvatarDeleted(res.data.user))
      .catch((err) => {
        const msg = err.response?.data?.error || 'Could not remove photo. Please try again.';
        setAvatarError(msg);
      })
      .finally(() => setRemoving(false));
  }

  return (
    <section className="profile-hero">
      <div className="profile-avatar-wrap">
        <Avatar
          name={user?.username || 'User'}
          src={avatarSrc}
          className="dashboard-avatar"
          background={user?.role === 'admin' ? '#C53030' : user?.role === 'reviewer' ? '#1E90FF' : '#6b7280'}
          onClick={() => !uploading && fileInputRef.current?.click()}
          alt={`${user?.username || 'User'} profile picture`}
        />
        {uploading && (
          <div className="profile-avatar-spinner-overlay" aria-hidden="true">
            <span className="profile-spinner" style={{ color: 'var(--surface)', width: 24, height: 24 }} />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          aria-label="Upload profile picture"
        />
        {!uploading && (
          <button
            className="profile-avatar-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload or change profile picture"
            title="Change photo"
            type="button"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        )}
      </div>

      <div className="profile-hero-info">
        <h1 className="profile-hero-name">{user?.username}</h1>
        <div className="profile-hero-meta">
          <span className={`profile-hero-role ${user?.role}`}>{user?.role}</span>
          {user?.created_at && (
            <span className="profile-hero-date">
              Member since {formatDate(user.created_at)}
            </span>
          )}
        </div>
        {avatarError && (
          <div className="profile-error-msg" style={{ marginTop: 12, maxWidth: 380, color: '#C53030' }} role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {avatarError}
          </div>
        )}
        {user?.avatar_url && !uploading && !removing && (
          <button
            className="profile-remove-photo-btn"
            onClick={handleRemove}
            type="button"
            disabled={removing}
          >
            {removing ? 'Removing…' : 'Remove photo'}
          </button>
        )}
      </div>
    </section>
  );
}

/* ─── ProfileInfoCard ─────────────────────────────────────────────── */
function ProfileInfoCard({ user }) {
  const [instEmail, setInstEmail] = useState(null);
  const [instEmailStatus, setInstEmailStatus] = useState('idle'); // 'idle'|'loading'|'ok'|'error'

  useEffect(() => {
    if (user?.role !== 'reviewer') return;
    setInstEmailStatus('loading');
    reviewersAPI.getMyApplication()
      .then((res) => {
        setInstEmail(res.data?.institutional_email || null);
        setInstEmailStatus('ok');
      })
      .catch(() => setInstEmailStatus('error'));
  }, [user?.role]);

  return (
    <div className="profile-card">
      <div className="profile-card-header">
        <h2 className="profile-card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          Account Details
        </h2>
      </div>
      <div className="profile-card-body">
        <div className="profile-info-row">
          <span className="profile-info-label">Username</span>
          <span className="profile-info-value">{user?.username}</span>
        </div>
        <div className="profile-info-row">
          <span className="profile-info-label">Account email</span>
          <span className="profile-info-value">{user?.email}</span>
        </div>
        {user?.role === 'reviewer' && (
          <div className="profile-info-row">
            <span className="profile-info-label">Institutional email</span>
            {instEmailStatus === 'loading' && (
              <span className="profile-info-muted">Loading…</span>
            )}
            {instEmailStatus === 'ok' && instEmail && (
              <span className="profile-info-value">{instEmail}</span>
            )}
            {instEmailStatus === 'ok' && !instEmail && (
              <span className="profile-info-muted">Not available</span>
            )}
            {instEmailStatus === 'error' && (
              <span className="profile-info-muted">Unavailable</span>
            )}
          </div>
        )}
        <div className="profile-info-row">
          <span className="profile-info-label">Role</span>
          <span className={`dashboard-user-role ${user?.role}`} style={{ marginLeft: 0 }}>
            {user?.role?.charAt(0).toUpperCase()}{user?.role?.slice(1)}
          </span>
        </div>
        <div className="profile-info-row">
          <span className="profile-info-label">Member since</span>
          <span className="profile-info-value">{formatDate(user?.created_at)}</span>
        </div>
        {user?.bio && (
          <div className="profile-info-row" style={{ alignItems: 'flex-start', borderBottom: 'none' }}>
            <span className="profile-info-label">Bio</span>
            <span className="profile-info-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{user.bio}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── BioSection ─────────────────────────────────────────────────── */
function BioSection({ user, onBioSaved }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync textarea when user object is updated (e.g. after async refresh on mount)
  useEffect(() => {
    setBio(user?.bio || '');
  }, [user?.bio]);

  const MAX = 500;
  const remaining = MAX - bio.length;
  const nearLimit = remaining <= 50;
  const isReviewer = user?.role === 'reviewer';
  const showWarning = isReviewer && !bio.trim();

  function handleEdit() {
    setSuccessMsg('');
    setErrorMsg('');
    setEditing(true);
  }

  function handleCancel() {
    setBio(user?.bio || '');
    setSuccessMsg('');
    setErrorMsg('');
    setEditing(false);
  }

  function handleSave() {
    setSuccessMsg('');
    setErrorMsg('');

    if (isReviewer && !bio.trim()) {
      setErrorMsg('Bio is required for reviewers.');
      return;
    }
    if (bio.length > MAX) {
      setErrorMsg(`Bio must be ${MAX} characters or fewer.`);
      return;
    }

    setSaving(true);
    updateBio(bio)
      .then((res) => {
        setSuccessMsg('Bio saved successfully.');
        onBioSaved(res.data.user);
        setEditing(false);
      })
      .catch((err) => {
        const msg = err.response?.data?.error || 'Failed to save bio. Please try again.';
        setErrorMsg(msg);
      })
      .finally(() => setSaving(false));
  }

  return (
    <div className="profile-card">
      <div className="profile-card-header">
        <h2 className="profile-card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Bio / About
          {isReviewer && <span className="profile-required" aria-label="required">*</span>}
        </h2>
        {!editing && (
          <button
            type="button"
            className="profile-edit-btn"
            onClick={handleEdit}
            aria-label="Edit bio"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
        )}
      </div>

      {showWarning && (
        <div className="profile-bio-warning" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>Reviewers must provide a bio describing their expertise. Please click Edit to add your bio.</span>
        </div>
      )}

      {!editing ? (
        <div className="profile-bio-readonly">
          {bio.trim() ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink-700)', lineHeight: 1.6 }}>{bio}</p>
          ) : (
            <p style={{ margin: 0, color: 'var(--ink-400)', fontStyle: 'italic' }}>
              {isReviewer ? 'No bio added yet. Click Edit to describe your expertise.' : 'No bio added yet. Click Edit to tell others about yourself.'}
            </p>
          )}
        </div>
      ) : (
        <div className="profile-bio-form">
          <div>
            <label htmlFor="profile-bio-input" className="profile-field-label" style={{ marginBottom: 6, display: 'block' }}>
              About yourself{isReviewer && <span className="profile-required" aria-hidden="true">*</span>}
            </label>
            <textarea
              id="profile-bio-input"
              className="profile-bio-textarea"
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setSuccessMsg('');
                setErrorMsg('');
              }}
              maxLength={MAX + 10}
              placeholder={isReviewer ? 'Describe your academic background and area of expertise…' : 'Tell others a bit about yourself…'}
              rows={4}
              aria-label="Bio text"
              aria-describedby="bio-counter"
              autoFocus
            />
            <div id="bio-counter" className={`profile-bio-counter${nearLimit ? ' near-limit' : ''}`}>
              {remaining} character{remaining !== 1 ? 's' : ''} remaining
            </div>
          </div>

          {errorMsg && (
            <div className="profile-error-msg" role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="profile-success-msg" role="status">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {successMsg}
            </div>
          )}

          <div className="profile-btn-row">
            <button
              className="dashboard-btn-primary"
              onClick={handleSave}
              disabled={saving || bio.length > MAX}
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {saving && <span className="profile-spinner" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save Bio'}
            </button>
            <button
              className="dashboard-btn-secondary"
              onClick={handleCancel}
              disabled={saving}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ChangePasswordSection ──────────────────────────────────────── */
function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  function resetForm() {
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setSuccessMsg('');
    setErrorMsg('');
  }

  function handleSubmitClick(e) {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    if (!currentPw || !newPw || !confirmPw) {
      setErrorMsg('All fields are required.');
      return;
    }
    if (newPw.length < 8) {
      setErrorMsg('New password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    setSaving(true);
    updatePassword(currentPw, newPw)
      .then(() => {
        setSuccessMsg('Password changed successfully.');
        resetForm();
      })
      .catch((err) => {
        const msg = err.response?.data?.error || 'Failed to change password. Please try again.';
        setErrorMsg(msg);
      })
      .finally(() => setSaving(false));
  }

  return (
    <>
      <div className="profile-card">
        <button
          type="button"
          className={`profile-accordion-toggle${open ? ' open' : ''}`}
          onClick={() => { setOpen(!open); resetForm(); }}
          aria-expanded={open}
          aria-controls="pw-section-body"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Change Password
          </span>
          <svg className="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {open && (
          <div id="pw-section-body" className="profile-accordion-body">
            <div className="profile-field-group">
              <label htmlFor="current-pw" className="profile-field-label">
                Current password<span className="profile-required" aria-label="required">*</span>
              </label>
              <input
                id="current-pw"
                type="password"
                className="profile-field-input"
                value={currentPw}
                onChange={(e) => { setCurrentPw(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                autoComplete="current-password"
                placeholder="Enter your current password"
              />
            </div>
            <div className="profile-field-group">
              <label htmlFor="new-pw" className="profile-field-label">
                New password<span className="profile-required" aria-label="required">*</span>
              </label>
              <input
                id="new-pw"
                type="password"
                className="profile-field-input"
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div className="profile-field-group">
              <label htmlFor="confirm-pw" className="profile-field-label">
                Confirm new password<span className="profile-required" aria-label="required">*</span>
              </label>
              <input
                id="confirm-pw"
                type="password"
                className="profile-field-input"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                autoComplete="new-password"
                placeholder="Re-enter new password"
              />
            </div>

            {errorMsg && (
              <div className="profile-error-msg" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="profile-success-msg" role="status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {successMsg}
              </div>
            )}

            <div className="profile-btn-row">
              <button
                type="button"
                className="dashboard-btn-primary"
                onClick={handleSubmitClick}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {saving && <span className="profile-spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Change Password'}
              </button>
              <button
                type="button"
                className="dashboard-btn-outline"
                onClick={() => { setOpen(false); resetForm(); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="profile-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="profile-confirm-dialog">
            <h3 id="confirm-title" className="profile-confirm-title">Confirm password change</h3>
            <p className="profile-confirm-body">
              Are you sure you want to change your password? You will need to use the new password the next time you log in.
            </p>
            <div className="profile-confirm-actions">
              <button
                type="button"
                className="dashboard-btn-outline"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary"
                onClick={handleConfirm}
              >
                Yes, change password
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main UserProfile page ──────────────────────────────────────── */
export default function UserProfile() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [localUser, setLocalUser] = useState(user);

  // Keep localUser in sync when the hook's user changes
  useEffect(() => {
    setLocalUser(user);
  }, [user]);

  function handleAvatarUploaded(updatedUser) {
    setLocalUser(updatedUser);
    refreshUser();
  }

  function handleAvatarDeleted(updatedUser) {
    setLocalUser(updatedUser);
    refreshUser();
  }

  function handleBioSaved(updatedUser) {
    setLocalUser(updatedUser);
    refreshUser();
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (!localUser) return null;

  return (
    <div className="profile-page">
      {/* Navbar — mirrors UserDashboard navbar */}
      <nav className="dashboard-navbar">
        <div className="dashboard-navbar-left">
          <Logo to="/" className="dashboard-logo" />

          <button
            type="button"
            className="dashboard-nav-link"
            onClick={() => navigate('/dashboard')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back to Dashboard
          </button>
        </div>

        <div className="dashboard-navbar-right">
          <div className="dashboard-user-menu">
            <Avatar
              name={localUser?.username || 'User'}
              src={getAvatarSrc(localUser?.avatar_url, null)}
              className="dashboard-avatar"
              background={localUser?.role === 'admin' ? '#C53030' : localUser?.role === 'reviewer' ? '#1E90FF' : '#6b7280'}
              alt={`${localUser?.username || 'User'} profile picture`}
            />
          </div>
          <button
            type="button"
            className="dashboard-nav-link danger"
            onClick={handleLogout}
            style={{ color: '#C53030' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="profile-content">
        <div className="profile-col">
          <ProfileHero
            user={localUser}
            onAvatarUploaded={handleAvatarUploaded}
            onAvatarDeleted={handleAvatarDeleted}
          />
          <ProfileInfoCard user={localUser} />
          <BioSection user={localUser} onBioSaved={handleBioSaved} />
          <ChangePasswordSection />
        </div>
      </div>
    </div>
  );
}
