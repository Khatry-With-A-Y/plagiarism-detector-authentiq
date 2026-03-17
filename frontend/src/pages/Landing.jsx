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
        <div className="logo">Authentiq</div>

        <div>
          <Link to="/login" className="nav-btn">Dashboard</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">

        <p className="badge">AI Powered Plagiarism Detection</p>

        <h1>
          Authentiq — Academic <br />
          Integrity, <span>Simplified</span>
        </h1>

        <p className="subtitle">
          Ensure originality and maintain credibility in your academic work.
        </p>

        <div className="hero-buttons">

          <Link to="/register" className="primary-btn">
            Start Checking
          </Link>

          <Link to="/login" className="secondary-btn">
            View Sample Report
          </Link>

        </div>

        <div className="stats">

          <div>
            <h3>99.7%</h3>
            <p>Accuracy</p>
          </div>

          <div>
            <h3>1M+</h3>
            <p>Papers Checked</p>
          </div>

          <div>
            <h3>&lt;60s</h3>
            <p>Detection Speed</p>
          </div>

        </div>

      </section>

      {/* FEATURES */}
      <section className="features">

        <h2>Designed for the Modern Scholar</h2>

        <div className="feature-grid">

          <div className="feature-card">
            <h4>Deep Analysis</h4>
            <p>Scan documents against academic databases and web sources.</p>
          </div>

          <div className="feature-card">
            <h4>Accurate Reports</h4>
            <p>Detailed similarity reports with highlighted matches.</p>
          </div>

          <div className="feature-card">
            <h4>Fast Results</h4>
            <p>Get plagiarism reports in seconds.</p>
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
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
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
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
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

        <div className="faq-item">

          <div className="faq-question" onClick={() => toggleFAQ(1)}>
            <span>Is my paper secure?</span>
            <button className="faq-arrow">▼</button>
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
            <button className="faq-arrow">▼</button>
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
            <button className="faq-arrow">▼</button>
          </div>

          {openFAQ === 3 && (
            <p className="faq-answer">
              Most reports are generated within 30–60 seconds.
            </p>
          )}

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
        © 2026 Authentiq
      </footer>

    </div>
  );
}

export default Landing;