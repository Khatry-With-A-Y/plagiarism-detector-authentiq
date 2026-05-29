import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import reviewersAPI from "../../api/reviewers";
import useAuth from "../../hooks/useAuth";
import Avatar from "../../components/Avatar";
import Logo from "../../components/Logo";
import "../dashboard.css";
import "../auth.css";

/**
 * Compose a UI-friendly message for a verification-email send / resend
 * / email-update error.
 *
 * The backend may return:
 *   - 429 with `{ error, retry_after, reason }` for cooldown / daily-cap.
 *   - 4xx/5xx with `{ error: <human sentence> }` for other failures.
 *
 * Historically the cooldown branch shipped a Python-tuple-looking
 * string in `error` (e.g. "('Please wait 52 seconds…', {'retry_after':
 * 52, 'reason': 'cooldown'})"). The backend has been fixed, but we
 * also compose the cooldown / daily-cap copy on the client from the
 * structured `retry_after` + `reason` fields. This keeps the user-
 * facing text consistent and well-formatted regardless of what the
 * server's `error` string looks like.
 *
 * The fallback is just `data.error` (or a generic sentence) so
 * non-rate-limit errors still surface their server-side reason.
 */
function buildResendErrorMessage(err, data) {
  const status = err?.response?.status;
  const retryAfter = typeof data?.retry_after === 'number' ? data.retry_after : null;
  const reason = data?.reason;

  if (status === 429 && retryAfter !== null) {
    // Intentionally NO time/seconds in the user-facing message — the
    // resend button itself already shows the live "Resend available
    // in Ns" countdown derived from the same `retry_after` value, so
    // embedding the time here too is redundant and reads noisy.
    if (reason === 'daily_cap') {
      return "You've reached the daily limit for verification emails. Please try again later, or contact support if you still can't access your inbox.";
    }
    // Default cooldown wording (between two consecutive sends).
    return 'Please wait a moment before requesting another verification link.';
  }

  // Anything not 429 — surface the server-side reason if any, else a
  // safe generic fallback.
  const raw = typeof data?.error === 'string' ? data.error.trim() : '';
  // Defensive: if a future regression leaks a Python-tuple-shaped
  // string into `error`, strip the surrounding parens + dict tail so
  // the user never sees `("…", {…})`.
  const cleaned = raw.startsWith("('") && raw.includes("',")
    ? raw.slice(2, raw.indexOf("',"))
    : raw;
  return cleaned || 'Failed to resend verification link. Please try again in a moment.';
}


function ApplyReviewer({ isEmbedded = false, onSubmitted = () => {}, onCancel = () => {} }) {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [institutions, setInstitutions] = useState([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [selectedInst, setSelectedInst] = useState(null);
  const [formData, setFormData] = useState({
    institutional_email: "",
    affiliation: "",
    bio: "",
    expertise_tags: ["CS"]
  });
  const [loading, setLoading] = useState(false);
  const [fetchingInst, setFetchingInst] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [myApp, setMyApp] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendInfo, setResendInfo] = useState(null);
  // `resendInfoType` lets the UI distinguish neutral confirmation messages
  // (e.g. "link sent") from rate-limit / mailer errors so we can colour them
  // appropriately. Values: 'success' | 'error' | null.
  const [resendInfoType, setResendInfoType] = useState(null);
  // Seconds remaining on the resend cooldown — set from the server's
  // `retry_after` on 429s and decremented locally every second. While > 0
  // the resend button is disabled.
  const [resendCooldown, setResendCooldown] = useState(0);

  // Inline "Edit institutional email" form (toggled by a small link next to
  // the displayed email). Kept colocated with the verification card so the
  // user can correct a typo without leaving the page.
  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [editEmailError, setEditEmailError] = useState(null);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [instRes, myAppRes] = await Promise.all([
          reviewersAPI.getInstitutions(),
          reviewersAPI.getMyApplication()
        ]);
        const instData = instRes.data;
        const myAppData = myAppRes.data;
        setInstitutions(instData);
        setMyApp(myAppData);
        
        if (myAppData && myAppData.application_status !== 'none') {
            if (myAppData.application_status === 'pending' || myAppData.application_status === 'approved' || myAppData.application_status === 'rejected') {
                onSubmitted();
            }
            setFormData({
                institutional_email: myAppData.institutional_email || "",
                affiliation: myAppData.affiliation || "",
                bio: myAppData.bio || "",
                expertise_tags: myAppData.expertise_tags || ["CS"]
            });
            const inst = instData.find(i => i.domain === myAppData.institution_domain);
            if (inst) setSelectedInst(inst);
        }
      } catch (err) {
        console.error("Error loading application data:", err);
        setError("Failed to load required data.");
      } finally {
        setFetchingInst(false);
      }
    };
    loadInitialData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!selectedInst) {
      setError("Please select an institution");
      setLoading(false);
      return;
    }

    try {
      await reviewersAPI.apply({
        ...formData,
        institution_domain: selectedInst.domain,
        institution_name: selectedInst.name
      });
      setSuccess(true);
      const updatedAppRes = await reviewersAPI.getMyApplication();
      setMyApp(updatedAppRes.data);
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit application");
    } finally {
      setLoading(false);
    }
  };

  // Resend the verification link via the dedicated, rate-limited endpoint.
  // The server enforces a 60s cooldown and a daily cap; on quota errors it
  // returns HTTP 429 with a `retry_after` (seconds) we use to drive the UI
  // countdown so the button stays disabled until the next send is allowed.
  const handleResend = async () => {
    if (!myApp) {
      setResendInfo("Cannot resend: missing application details.");
      setResendInfoType('error');
      return;
    }
    if (resendCooldown > 0) return; // belt + braces: button is also disabled.
    setResending(true);
    setResendInfo(null);
    setResendInfoType(null);
    try {
      const res = await reviewersAPI.resendVerification();
      setResendInfo(res.data?.message || "A new verification link has been sent to your institutional inbox.");
      setResendInfoType('success');
      // Start a short client-side cooldown immediately so the button can't
      // be hammered before the next allowed send. Mirrors the server-side
      // cooldown constant (60s) — kept generous to absorb clock skew.
      setResendCooldown(60);
    } catch (err) {
      const data = err.response?.data || {};
      // Build a UI-friendly message for rate-limit responses rather than
      // echoing whatever the server put in `data.error`. The backend used
      // to ship a Python-tuple-looking string for cooldowns (now fixed),
      // but composing the message client-side from the structured
      // `retry_after` / `reason` fields is both nicer copy AND a defense
      // in case the server ever regresses.
      setResendInfo(buildResendErrorMessage(err, data));
      setResendInfoType('error');
      if (err.response?.status === 429 && typeof data.retry_after === 'number') {
        setResendCooldown(Math.max(1, data.retry_after));
      }
    } finally {
      setResending(false);
    }
  };

  // Tick down the resend cooldown once a second. Single interval lives
  // only while the cooldown is active to keep the component idle when not
  // needed.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Open the inline edit-email form with the current value pre-filled so
  // the applicant only has to fix the typo.
  const handleStartEditEmail = () => {
    setEditEmailError(null);
    setResendInfo(null);
    setResendInfoType(null);
    setEditEmailValue(myApp?.institutional_email || "");
    setEditingEmail(true);
  };

  const handleCancelEditEmail = () => {
    setEditingEmail(false);
    setEditEmailError(null);
  };

  // Submit the corrected email. The backend resets `email_verified` to 0,
  // rotates the verification token, sends a fresh link, and counts the
  // send against the same daily quota as a regular resend.
  const handleSaveEmail = async (e) => {
    e?.preventDefault?.();
    const trimmed = (editEmailValue || '').trim();
    if (!trimmed) {
      setEditEmailError("Please enter your institutional email.");
      return;
    }
    if (trimmed.toLowerCase() === (myApp?.institutional_email || '').toLowerCase()) {
      setEditEmailError("This is already the email on your application.");
      return;
    }
    setSavingEmail(true);
    setEditEmailError(null);
    try {
      const res = await reviewersAPI.updateApplicationEmail(trimmed);
      const updated = await reviewersAPI.getMyApplication();
      setMyApp(updated.data);
      setEditingEmail(false);
      setResendInfo(
        res.data?.message ||
        "Email updated. A new verification link has been sent to your institutional inbox."
      );
      setResendInfoType('success');
      setResendCooldown(60);
    } catch (err) {
      const data = err.response?.data || {};
      // Reuse the same friendly-message composer as the resend flow so
      // rate-limit responses (429) show readable copy here too, instead
      // of leaking the raw server `error` field.
      setEditEmailError(buildResendErrorMessage(err, data) || "Failed to update the email.");
      if (err.response?.status === 429 && typeof data.retry_after === 'number') {
        // Reflect the rate-limit even inside the edit form so the user
        // understands why their change was rejected.
        setResendCooldown(Math.max(1, data.retry_after));
      }
    } finally {
      setSavingEmail(false);
    }
  };

  // Shared "Verify your institutional email" card — rendered in both the
  // embedded (sidebar) and standalone (full-page) layouts so the verify /
  // resend / edit-email UX stays identical regardless of entry point.
  // Visual primitives (`.apply-card`, `.apply-card-title`, `.apply-card-body`,
  // `.apply-help-text`) are declared at the bottom of `dashboard.css` —
  // keeping the inline-style noise to a minimum here while still letting
  // the form / edit-email sub-form reuse the existing `.auth-input-field`
  // and `.form-error` atoms.
  const renderVerifyEmailCard = () => (
    <div className="apply-card warning">
      <h3 className="apply-card-title warning">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
        Verify your institutional email
      </h3>
      <p className="apply-card-body">
        We sent a verification link to <strong>{myApp.institutional_email}</strong>.
        Click the link in your inbox to verify your email — your application stays
        invisible to admins until that's done. The link expires in 24 hours.
      </p>
      {/* Inset self-check callout — bad addresses are the #1 cause of stuck
          applications, so we surface a "double-check the address" prompt as
          its own visually distinct sub-card inside the warning card. */}
      <div
        style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          color: '#92400e',
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      >
        <strong>Double-check the address above.</strong> If it has a typo or you
        used the wrong account, fix it now — admins can only approve applicants
        whose institutional email is verified.
      </div>

      {!editingEmail ? (
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="dashboard-view-link"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            {resending
              ? 'Resending...'
              : resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : 'Resend verification link'}
          </button>
          {/* "Wrong email? Edit it" is a real themed action button (not a
              text link) — it shares the same `.dashboard-view-link`
              outlined-pill style as the adjacent "Resend verification
              link" button so the two CTAs in this row look like a
              cohesive pair. A small pencil icon visually distinguishes
              it from the resend (circular-arrow) button. */}
          <button
            type="button"
            className="dashboard-view-link"
            onClick={handleStartEditEmail}
            disabled={resending || savingEmail}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            Wrong email? Edit it
          </button>
          {resendInfo && (
            <span
              role="status"
              style={{
                fontSize: '13px',
                color: resendInfoType === 'error' ? '#b91c1c' : '#059669',
              }}
            >
              {resendInfo}
            </span>
          )}
        </div>
      ) : (
        <form onSubmit={handleSaveEmail} style={{ marginTop: '16px' }} className="apply-section">
          <div className="form-group">
            <label className="form-label" htmlFor="apply-edit-email">
              New institutional email
            </label>
            <input
              id="apply-edit-email"
              type="email"
              className="auth-input-field"
              value={editEmailValue}
              onChange={(e) => setEditEmailValue(e.target.value)}
              placeholder="e.g. john.doe@tu.edu.np"
              disabled={savingEmail}
              autoFocus
              required
            />
            <p className="apply-help-text">
              Must belong to an allowed institution domain. Changing the email
              sends a fresh verification link and counts toward your daily
              resend limit.
            </p>
            {editEmailError && (
              <div className="form-error" style={{ fontSize: '13px' }}>
                {editEmailError}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="dashboard-view-link"
              disabled={savingEmail}
            >
              {savingEmail ? 'Saving...' : 'Save & send new link'}
            </button>
            <button
              type="button"
              onClick={handleCancelEditEmail}
              disabled={savingEmail}
              style={{
                background: 'transparent',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: savingEmail ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );

  // Poll every 5s while we're waiting for the user to click the link in their
  // institutional inbox. Stops automatically once `email_verified` flips.
  useEffect(() => {
    if (!(myApp?.application_status === 'pending' && !myApp?.email_verified)) return;
    const intervalId = setInterval(async () => {
      try {
        const res = await reviewersAPI.getMyApplication();
        setMyApp(res.data);
      } catch (_e) {
        // Ignore transient errors; the next tick will retry.
      }
    }, 5000);
    return () => clearInterval(intervalId);
  }, [myApp?.application_status, myApp?.email_verified]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ---------------------------------------------------------------------
  // Single source of truth for the apply-page body (hero + status cards +
  // form). Previously the embedded and standalone branches each carried a
  // ~250-line near-identical copy of the same JSX; refactored into one
  // helper so every visual tweak now ships to both render paths at once.
  // The only behavioural difference between the two branches is what
  // "Back to Dashboard" does — passed in via the `onBack` argument.
  // ---------------------------------------------------------------------
  const renderBody = (onBack) => {
    // Pick the right status chip for the hero based on the backend state.
    // Kept inline (not a separate component) because it's a small,
    // page-specific concern and reuses the global `.apply-status-chip`
    // variants declared in dashboard.css.
    let statusChip = null;
    if (myApp?.application_status === 'pending' && !myApp?.email_verified) {
      statusChip = (
        <span className="apply-status-chip warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Awaiting email verification
        </span>
      );
    } else if (myApp?.application_status === 'pending' && !!myApp?.email_verified) {
      statusChip = (
        <span className="apply-status-chip success">
          {/* Purely cosmetic clock icon: "pending admin review" is a
              waiting state, so a clock face (circle + hour/minute
              hands) reads more accurately than a check mark. The
              .success variant still tints it green so the chip stays
              visually distinct from the amber clock used by the
              "Awaiting email verification" warning chip above. */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Pending admin review
        </span>
      );
    } else if (myApp?.application_status === 'rejected') {
      statusChip = (
        <span className="apply-status-chip danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          Application rejected
        </span>
      );
    } else if (!myApp || myApp.application_status === 'none') {
      statusChip = (
        <span className="apply-status-chip info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Ready to apply
        </span>
      );
    }

    const showForm = !(success || myApp?.application_status === 'pending');

    return (
      <div className="apply-shell">
        {/* Hero header: eyebrow pill + title + subtitle on the left,
            current application status chip on the right. Replaces the
            previous bare `<header>` with the system-wide hero pattern. */}
        <header className="apply-hero">
          <div className="apply-hero-left">
            <span className="apply-eyebrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <polyline points="17 11 19 13 23 9"></polyline>
              </svg>
              Reviewer onboarding
            </span>
            <h1>Apply to be a Reviewer</h1>
            <p className="apply-hero-subtitle">
              Join the peer-review panel to help verify academic integrity.
              Submit your details below — we'll confirm your institutional
              email and an admin will review your application shortly after.
            </p>
          </div>
          {statusChip}
        </header>

        {/* Status messages — only the relevant one renders at a time. */}
        {myApp?.application_status === 'pending' && !myApp?.email_verified && (
          renderVerifyEmailCard()
        )}

        {myApp?.application_status === 'pending' && !!myApp?.email_verified && (
          // Card + CTA are siblings inside a wrapper so the green
          // left-accent on the card hugs only the dialog text.
          <div>
            <div className="apply-card success">
              <h3 className="apply-card-title success">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                Email verified — pending admin review
              </h3>
              <p className="apply-card-body">
                Your institutional email is verified. You submitted an
                application on {new Date(myApp.submitted_at).toLocaleDateString()};
                it is now awaiting admin approval.
              </p>
            </div>
            {/* Contextual CTA rendered OUTSIDE the success card so the
                green left-accent stays proportional to the text above. */}
            <div style={{ marginTop: '16px' }}>
              <button className="dashboard-view-link" onClick={onBack}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Dashboard
              </button>
            </div>
          </div>
        )}

        {myApp?.application_status === 'rejected' && (
          <div className="apply-card danger">
            <h3 className="apply-card-title danger">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              Application Rejected
            </h3>
            <p className="apply-card-body">
              <strong>Reason:</strong> {myApp.decision_reason || 'No reason provided.'}
            </p>
            <p className="apply-card-body" style={{ color: '#64748b', fontSize: '13px' }}>
              You can update your details and re-apply below.
            </p>
          </div>
        )}

        {/* The application form itself, split into three themed sections
            so the user reads "Institution → Profile → Expertise" instead
            of one flat list of fields. */}
        {showForm && (
          <div className="apply-card">
            <form className="auth-form" style={{ gap: 0, padding: 0, maxWidth: '100%' }} onSubmit={handleSubmit}>
              {error && (
                <div className="form-error" style={{ marginBottom: '20px' }}>{error}</div>
              )}

              {/* --- Section 1: Institution ------------------------------ */}
              <section className="apply-section">
                <div className="apply-section-heading">
                  <h2 className="apply-section-title">Institution</h2>
                  <p className="apply-section-subtitle">
                    Pick the institution you're affiliated with and the
                    email address we should verify it against.
                  </p>
                </div>

                <div className="apply-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="apply-institution">
                      Institutional Affiliation
                    </label>
                    <select
                      id="apply-institution"
                      className="auth-input-field"
                      // No inline `height`/`padding`/`cursor` overrides
                      // here: the `select.auth-input-field` block in
                      // `dashboard.css` strips the native dropdown
                      // chrome, locks the box model (border-box, 15px /
                      // 1.5 line-height, font-family: inherit), reserves
                      // padding-right for a custom caret SVG, and forces
                      // `cursor: pointer`. That CSS is what keeps this
                      // <select> visually in sync (same height, same
                      // value-text baseline) with the adjacent
                      // institutional-email <input> in the .apply-grid-2
                      // row — please do NOT re-add inline overrides.
                      value={selectedInst?.domain || ""}
                      onChange={(e) => {
                        const inst = institutions.find(i => i.domain === e.target.value);
                        setSelectedInst(inst);
                      }}
                      required
                    >
                      <option value="" disabled>Select your institution</option>
                      {institutions.map(inst => (
                        <option key={inst.domain} value={inst.domain}>{inst.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="apply-email">
                      Institutional Email
                    </label>
                    <input
                      id="apply-email"
                      type="email"
                      className="auth-input-field"
                      placeholder="e.g. john.doe@tu.edu.np"
                      value={formData.institutional_email}
                      onChange={(e) => setFormData({ ...formData, institutional_email: e.target.value })}
                      required
                    />
                    <p className="apply-help-text">
                      Must end with <strong>@{selectedInst?.domain || 'institution.edu.np'}</strong>
                    </p>
                  </div>
                </div>
              </section>

              {/* --- Section 2: Profile ---------------------------------- */}
              <section className="apply-section">
                <div className="apply-section-heading">
                  <h2 className="apply-section-title">Profile</h2>
                  <p className="apply-section-subtitle">
                    Help admins evaluate your reviewer application — include
                    your role and a short summary of your background.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="apply-affiliation">
                    Affiliation / Department Detail
                  </label>
                  <input
                    id="apply-affiliation"
                    type="text"
                    className="auth-input-field"
                    placeholder="e.g. Associate Professor, Dept of CS"
                    value={formData.affiliation}
                    onChange={(e) => setFormData({ ...formData, affiliation: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="apply-bio">
                    Short Biography / Credentials
                  </label>
                  <textarea
                    id="apply-bio"
                    className="auth-input-field"
                    style={{ minHeight: '140px', padding: '14px', resize: 'vertical', lineHeight: 1.5 }}
                    placeholder="Briefly describe your academic background, research interests, and expertise..."
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    required
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <p className="apply-help-text">
                      Markdown is not supported. Plain text only.
                    </p>
                    <span
                      className={
                        'apply-help-text' +
                        (formData.bio.length > 2000 ? ' error' : '')
                      }
                    >
                      {formData.bio.length} / 2000
                    </span>
                  </div>
                </div>
              </section>

              {/* --- Section 3: Expertise -------------------------------- */}
              <section className="apply-section">
                <div className="apply-section-heading">
                  <h2 className="apply-section-title">Expertise</h2>
                  <p className="apply-section-subtitle">
                    The current version of the platform only supports
                    Computer Science reviews; additional domains will
                    become selectable in a future release.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Expertise Tags</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="apply-chip locked" title="Default tag — required in this release">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                      CS — Computer Science
                    </span>
                    <span className="apply-help-text muted">Required default tag</span>
                  </div>
                </div>
              </section>

              {/* Footer: explanatory note on the left, primary submit on
                  the right. Keeps the action visually anchored without
                  the form feeling top-heavy. */}
              <div className="apply-footer-actions">
                <p className="apply-footer-note">
                  Submitting this form sends a verification link to your
                  institutional inbox. An admin will review your
                  application after the email is verified.
                </p>
                <button
                  className="auth-submit-btn apply-submit-btn"
                  type="submit"
                  disabled={loading || formData.bio.length > 2000}
                >
                  {loading
                    ? 'Submitting...'
                    : (myApp?.application_status === 'rejected'
                      ? 'Update & Re-apply'
                      : 'Submit Application')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  };

  if (fetchingInst) {
    // Match the system loading pattern used elsewhere (UserDashboard,
    // AdminDashboard, Results): the `.dashboard-loading` container already
    // centers via flex + `min-height: 100vh`, paired with the themed
    // `.dashboard-spinner` circle. When standalone, return it directly —
    // avoid the `dashboard-page` + `dashboard-main` shell, which is a
    // 1280px column with `margin: 0 auto` designed to sit beside a
    // sidebar; overriding `marginLeft: 0` anchors that column to the
    // viewport's left edge and pulls the loader off-center.
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner"></div>
        <p>Loading application form...</p>
      </div>
    );
  }

  if (user?.role === 'reviewer') {
      const content = (
          <div className="dashboard-card" style={{ textAlign: 'center', padding: '40px', maxWidth: '800px', margin: isEmbedded ? '0 auto' : '40px auto' }}>
              <div className="dashboard-risk-badge low" style={{ marginBottom: '16px', display: 'inline-flex' }}>Approved Reviewer</div>
              <h2>You are already a verified reviewer</h2>
              <p style={{ color: '#64748b', marginTop: '8px' }}>
                  You have full access to the reviewer dashboard.
              </p>
              <button 
                  className="dashboard-view-link" 
                  style={{ marginTop: '24px', display: 'inline-flex' }}
                  onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}
              >
                  Go to {isAdmin ? 'Admin' : 'User'} Dashboard
              </button>
          </div>
      );

      if (isEmbedded) return content;

      // `.dashboard-main` already declares `max-width: 1280px; margin: 0 auto`,
      // so it self-centers horizontally on any viewport. Don't override
      // `marginLeft: 0` — that would pin the 1280px column to the viewport's
      // left edge and pull the entire page off-center.
      return (
          <div className="dashboard-page">
              <div className="dashboard-main">
                  {content}
              </div>
          </div>
      );
  }

  // Embedded branch (rendered inside the user dashboard's reviewer-application
  // tab). Delegates ALL body markup to `renderBody()` so the embedded and
  // standalone branches stay in perfect visual sync — only the back-handler
  // differs (`onCancel` here closes the tab; the standalone branch routes
  // to `/dashboard`).
  if (isEmbedded) {
    return renderBody(onCancel);
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-navbar">
        <div className="dashboard-navbar-left">
          <Logo to="/" className="dashboard-logo" />
          <div className="dashboard-nav-links">
            <Link to="/dashboard" className="dashboard-nav-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Dashboard
            </Link>
            <div className="dashboard-nav-link active">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <polyline points="17 11 19 13 23 9"></polyline>
                </svg>
                Reviewer Application
            </div>
          </div>
        </div>
        <div className="dashboard-navbar-right">
          <button className="dashboard-icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
          <div className="dashboard-user-menu">
            <Avatar
              name={user?.username || 'User'}
              src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:5000${user.avatar_url}`) : undefined}
              className="dashboard-avatar"
              background={user?.role === 'admin' ? '#C53030' : user?.role === 'reviewer' ? '#1E90FF' : '#6b7280'}
              onClick={() => setShowUserMenu(!showUserMenu)}
            />
            {showUserMenu && (
              <div className="dashboard-dropdown">
                <button className="dashboard-dropdown-item" onClick={() => navigate('/profile')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profile
                </button>
                <button className="dashboard-dropdown-item danger" onClick={handleLogout}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* `.dashboard-main` already centers itself via `max-width: 1280px;
          margin: 0 auto`. Only override padding here; do NOT set
          `marginLeft: 0`, which would kill the auto-centering and anchor
          the column to the viewport's left edge. The body itself comes
          from `renderBody()` so the embedded and standalone branches
          share the exact same JSX (header + status cards + form). */}
      <div className="dashboard-main" style={{ padding: '24px 40px' }}>
        {renderBody(() => navigate('/dashboard'))}
      </div>
      <footer className="dashboard-footer">
        <p className="dashboard-footer-copyright">© 2026 Authentiq Plagiarism Detection. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default ApplyReviewer;
