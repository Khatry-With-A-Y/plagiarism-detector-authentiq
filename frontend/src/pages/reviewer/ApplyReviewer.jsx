import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import reviewersAPI from "../../api/reviewers";
import useAuth from "../../hooks/useAuth";
import "../dashboard.css";
import "../auth.css";

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (fetchingInst) {
    if (isEmbedded) {
      return <div className="dashboard-loading">Loading application form...</div>;
    }
    return (
      <div className="dashboard-page">
        <div className="dashboard-main" style={{ marginLeft: 0 }}>
          <div className="dashboard-loading">Loading application form...</div>
        </div>
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

      return (
          <div className="dashboard-page">
              <div className="dashboard-main" style={{ marginLeft: 0 }}>
                  {content}
              </div>
          </div>
      );
  }

  if (isEmbedded) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header className="dashboard-header" style={{ marginBottom: '24px' }}>
          <div>
            <h1 className="dashboard-title">Apply to be a Reviewer</h1>
            <p className="dashboard-subtitle">
              Join the peer-review panel to help verify academic integrity.
            </p>
          </div>
          <button className="dashboard-view-link" onClick={onCancel}>
            Back to Dashboard
          </button>
        </header>

        {/* Status Messages */}
        {success && (
          <div className="dashboard-card" style={{ marginBottom: '24px', borderLeft: '4px solid #10b981', padding: '20px' }}>
              <h3 style={{ color: '#059669', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Application Submitted
              </h3>
              <p style={{ color: '#374151' }}>Your application is now pending admin review. We'll verify your institutional affiliation shortly.</p>
          </div>
        )}

        {myApp?.application_status === 'pending' && !success && (
            <div className="dashboard-card" style={{ marginBottom: '24px', borderLeft: '4px solid #f59e0b', padding: '20px' }}>
                <h3 style={{ color: '#d97706', marginBottom: '4px' }}>Application Pending</h3>
                <p style={{ color: '#374151' }}>You submitted an application on {new Date(myApp.submitted_at).toLocaleDateString()}. It is currently awaiting admin approval.</p>
            </div>
        )}

        {myApp?.application_status === 'rejected' && (
            <div className="dashboard-card" style={{ marginBottom: '24px', borderLeft: '4px solid #ef4444', padding: '20px' }}>
                <h3 style={{ color: '#dc2626', marginBottom: '4px' }}>Application Rejected</h3>
                <p style={{ color: '#374151' }}><strong>Reason:</strong> {myApp.decision_reason || "No reason provided."}</p>
                <p style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>You can update your details and re-apply below.</p>
            </div>
        )}

        {/* Form */}
        {!(success || myApp?.application_status === 'pending') && (
          <div className="dashboard-card" style={{ padding: '32px' }}>
            <form className="auth-form" style={{ maxWidth: '100%', padding: '0' }} onSubmit={handleSubmit}>
                {error && <div className="form-error" style={{ marginBottom: '24px' }}>{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div className="form-group">
                        <label className="form-label">Institutional Affiliation</label>
                        <select 
                            className="auth-input-field" 
                            style={{ height: '48px', cursor: 'pointer' }}
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
                        <label className="form-label">Institutional Email</label>
                        <input
                            type="email"
                            className="auth-input-field"
                            placeholder="e.g. john.doe@tu.edu.np"
                            value={formData.institutional_email}
                            onChange={(e) => setFormData({...formData, institutional_email: e.target.value})}
                            required
                        />
                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                            Must end with @{selectedInst?.domain || "institution.edu.np"}
                        </p>
                    </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                    <label className="form-label">Affiliation/Department Detail</label>
                    <input
                        type="text"
                        className="auth-input-field"
                        placeholder="e.g. Associate Professor, Dept of CS"
                        value={formData.affiliation}
                        onChange={(e) => setFormData({...formData, affiliation: e.target.value})}
                        required
                    />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                    <label className="form-label">Short Biography / Credentials</label>
                    <textarea
                        className="auth-input-field"
                        style={{ minHeight: '140px', padding: '14px', resize: 'vertical', lineHeight: '1.5' }}
                        placeholder="Briefly describe your academic background, research interests, and expertise..."
                        value={formData.bio}
                        onChange={(e) => setFormData({...formData, bio: e.target.value})}
                        required
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <span style={{ fontSize: '12px', color: formData.bio.length > 2000 ? '#ef4444' : '#64748b' }}>
                            {formData.bio.length} / 2000
                        </span>
                    </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                    <label className="form-label">Expertise Tags</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="dashboard-risk-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '4px 12px' }}>
                            CS (Computer Science)
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                            (P0 default tag)
                        </span>
                    </div>
                </div>

                <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        className="auth-submit-btn" 
                        type="submit" 
                        disabled={loading || formData.bio.length > 2000}
                        style={{ width: 'auto', minWidth: '220px', margin: 0 }}
                    >
                    {loading ? "Submitting..." : (myApp?.application_status === 'rejected' ? "Update & Re-apply" : "Submit Application")}
                    </button>
                </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-navbar">
        <div className="dashboard-navbar-left">
          <Link to="/" className="dashboard-logo">
            <svg className="dashboard-logo-icon" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2"/>
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="dashboard-logo-text">Authentiq</span>
          </Link>
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
            <div className="dashboard-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
              <img src={`https://ui-avatars.com/api/?name=${user?.username || 'User'}&background=1e40af&color=fff`} alt="User" />
            </div>
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

      <div className="dashboard-main" style={{ marginLeft: 0, padding: '24px 40px' }}>
        <header className="dashboard-header" style={{ marginBottom: '24px', maxWidth: '900px', margin: '0 auto 24px' }}>
          <div>
            <h1 className="dashboard-title">Apply to be a Reviewer</h1>
            <p className="dashboard-subtitle">
              Join the peer-review panel to help verify academic integrity.
            </p>
          </div>
          <button className="dashboard-view-link" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </header>

        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            {success && (
            <div className="dashboard-card" style={{ marginBottom: '24px', borderLeft: '4px solid #10b981', padding: '20px' }}>
                <h3 style={{ color: '#059669', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    Application Submitted
                </h3>
                <p style={{ color: '#374151' }}>Your application is now pending admin review. We'll verify your institutional affiliation shortly.</p>
            </div>
            )}

            {myApp?.application_status === 'pending' && !success && (
                <div className="dashboard-card" style={{ marginBottom: '24px', borderLeft: '4px solid #f59e0b', padding: '20px' }}>
                    <h3 style={{ color: '#d97706', marginBottom: '4px' }}>Application Pending</h3>
                    <p style={{ color: '#374151' }}>You submitted an application on {new Date(myApp.submitted_at).toLocaleDateString()}. It is currently awaiting admin approval.</p>
                </div>
            )}

            {myApp?.application_status === 'rejected' && (
                <div className="dashboard-card" style={{ marginBottom: '24px', borderLeft: '4px solid #ef4444', padding: '20px' }}>
                    <h3 style={{ color: '#dc2626', marginBottom: '4px' }}>Application Rejected</h3>
                    <p style={{ color: '#374151' }}><strong>Reason:</strong> {myApp.decision_reason || "No reason provided."}</p>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>You can update your details and re-apply below.</p>
                </div>
            )}

            {!(success || myApp?.application_status === 'pending') && (
              <div className="dashboard-card" style={{ padding: '32px' }}>
                <form className="auth-form" style={{ maxWidth: '100%', padding: '0' }} onSubmit={handleSubmit}>
                    {error && <div className="form-error" style={{ marginBottom: '24px' }}>{error}</div>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div className="form-group">
                            <label className="form-label">Institutional Affiliation</label>
                            <select 
                                className="auth-input-field" 
                                style={{ height: '48px', cursor: 'pointer' }}
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
                            <label className="form-label">Institutional Email</label>
                            <input
                                type="email"
                                className="auth-input-field"
                                placeholder="e.g. john.doe@tu.edu.np"
                                value={formData.institutional_email}
                                onChange={(e) => setFormData({...formData, institutional_email: e.target.value})}
                                required
                            />
                            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                Must end with @{selectedInst?.domain || "institution.edu.np"}
                            </p>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '12px' }}>
                        <label className="form-label">Affiliation/Department Detail</label>
                        <input
                            type="text"
                            className="auth-input-field"
                            placeholder="e.g. Associate Professor, Dept of CS"
                            value={formData.affiliation}
                            onChange={(e) => setFormData({...formData, affiliation: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group" style={{ marginTop: '12px' }}>
                        <label className="form-label">Short Biography / Credentials</label>
                        <textarea
                            className="auth-input-field"
                            style={{ minHeight: '140px', padding: '14px', resize: 'vertical', lineHeight: '1.5' }}
                            placeholder="Briefly describe your academic background, research interests, and expertise..."
                            value={formData.bio}
                            onChange={(e) => setFormData({...formData, bio: e.target.value})}
                            required
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <span style={{ fontSize: '12px', color: formData.bio.length > 2000 ? '#ef4444' : '#64748b' }}>
                                {formData.bio.length} / 2000
                            </span>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '12px' }}>
                        <label className="form-label">Expertise Tags</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span className="dashboard-risk-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '4px 12px' }}>
                                CS (Computer Science)
                            </span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                (P0 default tag)
                            </span>
                        </div>
                    </div>

                    <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button 
                            className="auth-submit-btn" 
                            type="submit" 
                            disabled={loading || formData.bio.length > 2000}
                            style={{ width: 'auto', minWidth: '220px', margin: 0 }}
                        >
                        {loading ? "Submitting..." : (myApp?.application_status === 'rejected' ? "Update & Re-apply" : "Submit Application")}
                        </button>
                    </div>
                </form>
            </div>
            )}
        </div>
      </div>
      <footer className="dashboard-footer">
        <p className="dashboard-footer-copyright">© 2026 Authentiq Plagiarism Detection. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default ApplyReviewer;
