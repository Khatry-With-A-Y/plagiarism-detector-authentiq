import React, { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "./landing.css";

const STEPS = [
  {
    num: "01",
    label: "Upload",
    desc: "Submit TXT, PDF, DOC or DOCX files up to 100 MB per submission.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <polyline points="9 15 12 12 15 15" />
      </svg>
    ),
  },
  {
    num: "02",
    label: "Review",
    desc: "N-gram TF-IDF analysis with sentence-level highlights and reference exclusion.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    num: "03",
    label: "Peer Review",
    desc: "Voluntary submission to 5 reviewers (double-blind) for contextual feedback within 72 hours.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    num: "04",
    label: "Promotion",
    desc: "Approved works are added to our corpus for future checks.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
];

const FEATURES = [
  {
    title: "Enhanced Detection",
    desc: "N-gram TF-IDF similarity with sentence-level evidence + reference exclusion. No black-box AI scores.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    title: "Peer-Review Pipeline",
    desc: "Low similarity submissions can enter a double-blind 5-reviewer panel with a guaranteed 72-hour turnaround.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: "Data Sovereignty",
    desc: "Documents are not shared without consent. Optional corpus contribution with full origin tracking.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: "Audit Transparency",
    desc: "Full versioned audit trail with institutional verification. Every decision is backed by human review and evidence.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
];

const FAQS = [
  {
    q: "How is similarity evidence presented?",
    a: "We provide sentence-level highlights using N-gram (bi-gram and tri-gram) matching. Our system tries to automatically excludes your bibliography and reference sections to ensure accuracy.",
  },
  {
    q: "What happens if my similarity is low?",
    a: "If your submission shows low similarity, you become eligible for our double-blind peer-review panel to further verify originality and receive academic feedback.",
  },
  {
    q: "How long does peer review take?",
    a: "Our peer reviewers operate within a strict 72-hour window. You will receive pseudonymous feedback from a panel of 5 experts.",
  },
  {
    q: "Is my data secure?",
    a: "Absolutely. We utilize privacy-first design. Documents are never shared with 3rd parties without your explicit consent.",
  },
];

function ProcessWidget() {
  return (
    <div className="process-widget" aria-hidden="true">
      {/* CARD 1: UPLOAD */}
      <div className="process-card card-upload">
        <div className="pc-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 12 15 15" />
          </svg>
        </div>
        <span className="pc-label">Upload</span>
        <div className="pc-lines">
          <div className="pc-line" style={{ width: "50%" }} />
          <div className="pc-line" style={{ width: "80%" }} />
          <div className="pc-line" style={{ width: "40%" }} />
        </div>
      </div>

      {/* CARD 2: VIEW REPORT */}
      <div className="process-card card-report">
        <div className="pc-header">
          <span className="pc-title">VIEW REPORT</span>
          <div className="pc-status-dot" />
        </div>
        <div className="pc-body">
          <div className="pc-bar-list">
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: "85%", background: "oklch(0.92 0.04 90)" }} />
            </div>
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: "40%", background: "oklch(0.92 0.04 200)" }} />
            </div>
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: "60%", background: "oklch(0.92 0.04 90)" }} />
            </div>
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: "30%", background: "oklch(0.92 0.04 200)" }} />
            </div>
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: "75%", background: "oklch(0.92 0.04 25)" }} />
            </div>
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: "50%", background: "oklch(0.92 0.04 25)" }} />
            </div>
          </div>
          <div className="pc-grey-lines">
            <div className="pc-grey-line" style={{ width: "65%" }} />
            <div className="pc-grey-line" style={{ width: "45%" }} />
            <div className="pc-grey-line" style={{ width: "80%" }} />
            <div className="pc-grey-line" style={{ width: "55%" }} />
            <div className="pc-grey-line" style={{ width: "70%" }} />
            <div className="pc-grey-line" style={{ width: "40%" }} />
          </div>
        </div>
      </div>

      {/* CARD 3: PEER REVIEW */}
      <div className="process-card card-review">
        <div className="pc-header">
          <span className="pc-title pc-title--review">Submit for Peer Review</span>
        </div>
        <div className="pc-body">
          <div className="pc-avatar-cluster">
            <div className="pc-center-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`pc-avatar pc-avatar-${i}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            ))}
          </div>
        </div>
        <div className="pc-footer">
          <div className="pc-footer-disclaimer">Guaranteed completion</div>
          <div className="pc-footer-disclaimer">within 72 hours</div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const [openFAQ, setOpenFAQ] = useState(null);

  const toggleFAQ = (index) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  return (
    <div className="landing">
      {/* NAVBAR */}
      <nav className="navbar">
        <Logo to="/" />
        <div className="nav-right">
          <Link to="/login" className="nav-link">Login</Link>
          <Link to="/register" className="nav-btn">Get Started</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-left">
            <h1 className="hero-heading">
              Authentiq: Academic<br />
              Integrity, <span className="hero-accent">Simplified</span>
            </h1>
            <p className="hero-tagline">Write with confidence, cite with ease</p>
            <p className="hero-sub">
              Upload a draft, receive sentence-level plagiarism evidence. Optionally, contribute to our corpus through a voluntary double-blind peer review process.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn-primary">Start My First Check</Link>
              <a href="#faq" className="btn-ghost">View FAQs</a>
            </div>
          </div>
          <div className="hero-right">
            <ProcessWidget />
          </div>
        </div>

        {/* TICKER */}
        <div className="ticker-rail">
          <div className="ticker-track">
            {["Enhanced N-gram Detection", "Double-blind Peer Review", "Privacy-first Design", "72-hour Turnaround", "100 MB Max File Size", "4 Supported Formats", "Institutional Verification", "Audit Trail Included",
              "Enhanced N-gram Detection", "Double-blind Peer Review", "Privacy-first Design", "72-hour Turnaround", "100 MB Max File Size", "4 Supported Formats", "Institutional Verification", "Audit Trail Included"].map((item, i) => (
              <span key={i} className="ticker-item">
                <svg className="ticker-dot" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3" /></svg>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="stats-bar">
        <div className="stat-pill">
          <strong>72 Hours</strong>
          <span>Reviewer decision window</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-pill">
          <strong>4 Formats</strong>
          <span>Supported submissions</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-pill">
          <strong>100 MB</strong>
          <span>Maximum file size</span>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="section-hiw">
        <div className="section-inner">
          <h2 className="section-heading">How it Works</h2>
          <p className="section-body">
            A rigorous 4-step workflow designed to protect academic integrity through  evidence and human expertise.
          </p>
          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div key={i} className="step-card">
                <div className="step-icon-wrap">
                  {step.icon}
                </div>
                <div className="step-num">STEP {step.num}</div>
                <h3 className="step-label">{step.label}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section-features">
        <div className="section-inner">
          <h2 className="features-heading">
            Everything you need to <span className="feature-accent">excel.</span>
          </h2>
          <p className="features-sub">
            We've tailored every feature to support the modern student workflow, focusing on speed and absolute evidence-based privacy.
          </p>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <div>
                  <h3 className="feature-title">{f.title}</h3>
                  <p className="feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section-faq">
        <div className="section-inner section-inner--narrow">
          <h2 className="section-heading">FAQs</h2>
          <p className="section-body">
            Everything you need to <span className="faq-accent">know</span> about using Authentiq for your studies.
          </p>
          <div className="faq-list">
            {FAQS.map((item, i) => (
              <div key={i} className={`faq-item ${openFAQ === i ? "faq-item--open" : ""}`}>
                <button className="faq-q" onClick={() => toggleFAQ(i)} aria-expanded={openFAQ === i}>
                  <span>{item.q}</span>
                  <span className="faq-icon">{openFAQ === i ? "−" : "+"}</span>
                </button>
                <div className="faq-a-wrap">
                  {openFAQ === i && <p className="faq-a">{item.a}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-cta">
        <div className="cta-inner">
          <h2 className="cta-heading">
            Ready to verify originality with<br />
            evidence and human review?
          </h2>
          <div className="cta-actions">
            <Link to="/register" className="btn-primary btn-primary--cta">Create Free Account</Link>
            <a href="#how-it-works" className="btn-outline-light">See How Peer Review Works</a>
          </div>
          <div className="cta-trust">
            <span className="cta-trust-item">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.33L2 4v4c0 3.7 2.56 7.16 6 8 3.44-.84 6-4.3 6-8V4L8 1.33z" />
                <polyline points="5.5 8 7 9.5 10.5 6" />
              </svg>
              Privacy-First Design
            </span>
            <span className="cta-trust-item">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4v4l2.5 2.5" />
                <circle cx="8" cy="8" r="6.5" />
              </svg>
              5 Reviewers Per Panel
            </span>
            <span className="cta-trust-item">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 4v4l3 1.5" />
              </svg>
              72-Hour Turnaround
            </span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <p className="footer-copy">© 2026 Authentiq Systems. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default Landing;
