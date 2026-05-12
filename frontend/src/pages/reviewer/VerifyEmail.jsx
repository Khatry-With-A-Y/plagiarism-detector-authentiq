import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import reviewersAPI from "../../api/reviewers";
import "../dashboard.css";
import "../auth.css";

// Landing page hit by the verification link from the institutional inbox.
// Reads `?token=...` from the URL on mount and POSTs it to the backend.
// The endpoint is bound to the currently logged-in user — a leaked link
// cannot verify a different account.
function VerifyEmail() {
  const navigate = useNavigate();
  // 'verifying' → in flight; 'success' → email verified; 'error' → bad link.
  const [state, setState] = useState("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") || "").trim();

    if (!token) {
      setState("error");
      setErrorMsg("No verification token was found in the URL.");
      return;
    }

    let cancelled = false;
    reviewersAPI
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setState("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(
          err?.response?.data?.error ||
            "We couldn't verify your email. The link may be invalid, expired, or already used."
        );
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const card = (
    <div
      className="dashboard-card"
      style={{
        textAlign: "center",
        padding: "40px",
        maxWidth: "560px",
        margin: "60px auto",
      }}
    >
      {state === "verifying" && (
        <>
          <h2 style={{ marginBottom: "8px" }}>Verifying your email…</h2>
          <p style={{ color: "#64748b" }}>One moment, please.</p>
        </>
      )}

      {state === "success" && (
        <>
          <div
            className="dashboard-risk-badge low"
            style={{ marginBottom: "16px", display: "inline-flex" }}
          >
            Verified
          </div>
          <h2 style={{ marginBottom: "8px" }}>Email verified</h2>
          <p style={{ color: "#374151", marginTop: "4px" }}>
            Your institutional email is now verified. Your reviewer
            application is pending admin review.
          </p>
          <div
            style={{
              marginTop: "24px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className="dashboard-view-link"
              style={{ display: "inline-flex" }}
              onClick={() => navigate("/reviewer/apply")}
            >
              View application status
            </button>
            <button
              className="dashboard-view-link"
              style={{ display: "inline-flex" }}
              onClick={() => navigate("/dashboard")}
            >
              Go to dashboard
            </button>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <div
            className="dashboard-risk-badge high"
            style={{ marginBottom: "16px", display: "inline-flex" }}
          >
            Verification failed
          </div>
          <h2 style={{ marginBottom: "8px" }}>We couldn't verify this link</h2>
          <p style={{ color: "#374151", marginTop: "4px" }}>{errorMsg}</p>
          <p style={{ color: "#64748b", fontSize: "14px", marginTop: "12px" }}>
            If your link expired, return to the application page and resubmit
            to receive a fresh verification link.
          </p>
          <div
            style={{
              marginTop: "24px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/reviewer/apply"
              className="dashboard-view-link"
              style={{ display: "inline-flex" }}
            >
              Back to application
            </Link>
            <Link
              to="/dashboard"
              className="dashboard-view-link"
              style={{ display: "inline-flex" }}
            >
              Go to dashboard
            </Link>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="dashboard-page">
      <div className="dashboard-main" style={{ marginLeft: 0 }}>
        {card}
      </div>
    </div>
  );
}

export default VerifyEmail;
