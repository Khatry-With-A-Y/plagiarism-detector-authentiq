import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./landing.css";

function Landing() {
  const [openFAQ, setOpenFAQ] = useState(null);

  const toggleFAQ = (index) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  return (
    <div className="landing">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="logo">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2"/>
            <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Authentiq</span>
        </div>
        <div className="nav-right">
          <Link to="/login" className="nav-link">Login</Link>
          <Link to="/register" className="nav-btn">Get Started</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <p className="badge">Next-Gen Academic Integrity</p>

        <h1>
          Authentiq — Academic<br />
          Integrity, <span>Simplified</span>
        </h1>

        <p className="subtitle">
          Ensure originality and maintain credibility in your academic work.
        </p>

        <div className="hero-buttons">
          <Link to="/register" className="primary-btn">
            Start My First Check
          </Link>
          <Link to="/login" className="secondary-btn">
            View Sample Report
          </Link>
        </div>

        <div className="stats">
          <div className="stat-item">
            <h3>99.9%</h3>
            <p>UPTIME</p>
          </div>
          <div className="stat-item">
            <h3>1M+</h3>
            <p>SOURCES</p>
          </div>
          <div className="stat-item">
            <h3>~60s</h3>
            <p>AVERAGE SPEED</p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features">
        <div className="features-grid">
          <div className="features-left">
            <h2>Designed for the Modern Scholar</h2>

            <p>
              Authentiq was born from the belief that academic integrity tools
              shouldn't be complex or intrusive. We bridge the gap between
              rigorous analysis and effortless user experience, ensuring that
              every writer has access to top-tier verification technology.
            </p>

            <div className="feature-highlights">
              <div className="highlight">
                <div className="highlight-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h4>Privacy Focused</h4>
                  <p>We never store or share your full documents without consent.</p>
                </div>
              </div>

              <div className="highlight">
                <div className="highlight-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
                <div>
                  <h4>Academic Standards</h4>
                  <p>Built to support citation quality and research ethics.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mission-card">
            <div className="mission-header">
              <div className="mission-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h3>Our Mission &amp; Privacy</h3>
                <p className="mission-subtitle">
                  Your intellectual property is sacred. Our mission is to provide secure, private checks for academic papers without ever compromising your ownership.
                </p>
              </div>
            </div>

            <ul className="mission-list">
              <li>
                <span className="check-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Transparent data management practices
              </li>
              <li>
                <span className="check-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Secure document handling pipelines
              </li>
              <li>
                <span className="check-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                No sharing with global search databases
              </li>
              <li>
                <span className="check-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Optional data contributions by willing users
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section">
        <h2 className="section-title">How it Works</h2>

        <p className="section-subtitle">
          Beneath the simple interface lies a sophisticated analysis engine built for precision.
        </p>

        <div className="cards-wrapper">
          <div className="card">
            <div className="icon-wrap">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 className="card-title">Phrase-Level Analysis</h3>
            <p className="card-text">
              We go beyond keyword matching. Our advanced system identifies phrase-level
              similarities, recognizing patterns even when wording is slightly altered.
            </p>
          </div>

          <div className="card">
            <div className="icon-wrap">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3 className="card-title">Academic Comparison</h3>
            <p className="card-text">
              Robust comparison against millions of academic sources including journals,
              institutional repositories and historical archives.
            </p>
          </div>

          <div className="card">
            <div className="icon-wrap">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="card-title">Instant Results</h3>
            <p className="card-text">
              Our optimized engine delivers results in seconds allowing you to
              iterate on your work and meet deadlines with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq">
        <h2>Frequently Asked Questions</h2>

        <div className="faq-container">
          <div className="faq-item">
            <div className="faq-question" onClick={() => toggleFAQ(1)}>
              <span>Is my paper secure?</span>
              <span className={`faq-arrow ${openFAQ === 1 ? 'open' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
            {openFAQ === 1 && (
              <p className="faq-answer">
                Yes. Your documents are securely processed and never shared.
              </p>
            )}
          </div>

          <div className="faq-item">
            <div className="faq-question" onClick={() => toggleFAQ(2)}>
              <span>What file types are supported?</span>
              <span className={`faq-arrow ${openFAQ === 2 ? 'open' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
            {openFAQ === 2 && (
              <p className="faq-answer">
                We support PDF, DOC, DOCX and TXT files.
              </p>
            )}
          </div>

          <div className="faq-item">
            <div className="faq-question" onClick={() => toggleFAQ(3)}>
              <span>How long does detection take?</span>
              <span className={`faq-arrow ${openFAQ === 3 ? 'open' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
            {openFAQ === 3 && (
              <p className="faq-answer">
                Most reports are generated within 30–60 seconds.
              </p>
            )}
          </div>

          <div className="faq-item">
            <div className="faq-question" onClick={() => toggleFAQ(4)}>
              <span>Can I check multiple documents at once?</span>
              <span className={`faq-arrow ${openFAQ === 4 ? 'open' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
            {openFAQ === 4 && (
              <p className="faq-answer">
                Yes, you can upload and check multiple documents in your dashboard.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <h2>Ready to ensure your integrity?</h2>
        <p>Join thousands of researchers using Authentiq.</p>
        <Link to="/register" className="cta-btn">
          Get Started Now
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-links">
          <a href="#">Terms of Service</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Cookies</a>
          <a href="#">Contact Us</a>
        </div>
        <p className="footer-copyright">© 2026 Authentiq. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default Landing;
