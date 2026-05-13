import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import SimilarityMatchesReport from '../../components/SimilarityMatchesReport';
import {
  calculateRiskLevel,
  RISK_PROFILES,
  SCORE_INPUT_SCALES,
} from '../../utils/riskAssessment';
import '../dashboard.css';

const FAIL_REASON_LABELS = {
  suspected_paraphrase:  'Suspected paraphrasing of existing corpus',
  insufficient_citation: 'Insufficient citation',
  low_content_quality:   'Content quality below threshold',
  out_of_scope:          'Out of CS scope',
  other:                 'Other (see comment)',
};

const FAIL_REASON_TAXONOMY = Object.keys(FAIL_REASON_LABELS);

function EligibilitySummaryCard({ eligibility }) {
  if (!eligibility) return null;

  const { max_doc_score, max_sentence_score, threshold } = eligibility;
  
  const docScorePct = (max_doc_score * 100).toFixed(1);
  const sentScorePct = (max_sentence_score * 100).toFixed(1);
  const thresholdPct = (threshold * 100).toFixed(0);

  return (
    <div className="review-eligibility-card dashboard-card">
      <div className="review-eligibility-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        Eligibility Evidence
      </div>
      <div className="review-eligibility-body">
        <div className="review-eligibility-row">
          <span className="review-eligibility-label">Max Doc Similarity:</span>
          <span className="review-eligibility-value">{docScorePct}%</span>
        </div>
        <div className="review-eligibility-row">
          <span className="review-eligibility-label">Max Sentence Similarity:</span>
          <span className="review-eligibility-value">{sentScorePct}%</span>
        </div>
        <div className="review-eligibility-row">
          <span className="review-eligibility-label" title="Submissions must be below this threshold to enter peer review">
            Review Threshold:
          </span>
          <span className="review-eligibility-value">Under {thresholdPct}%</span>
        </div>
      </div>
    </div>
  );
}

function LowEvidenceBanner() {
  return (
    <div className="review-low-evidence-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div className="review-low-evidence-content">
        <strong>Limited automated evidence available.</strong>
        <p>This submission passed the similarity threshold but no sentence-level matches could be extracted (possibly due to PDF layout issues). Please review the original document carefully using the PDF tab.</p>
      </div>
    </div>
  );
}

function ReviewHeader({ assignment, submissionId, isReadOnly, onBack, actionButtonLabel, onOpenActions, activeDocTab, onChangeTab, pdfTabAvailable, showDeadlinePill }) {
  return (
    <div className="review-page-header">
      <div className="review-header-title-row">
        <button className="review-header-breadcrumb" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Go back
        </button>
        <span className="review-header-divider" aria-hidden="true">|</span>
        <h1 className="review-header-title">
          {isReadOnly ? 'Submitted Review' : 'Review Assignment'}
        </h1>
        <span className="review-header-divider" aria-hidden="true">|</span>
        <span className="review-header-meta">
          {assignment?.filename || `Submission #${submissionId}`}
        </span>
        <span className="dashboard-risk-badge pending review-header-domain-badge">
          {assignment?.domain_tag || 'CS'}
        </span>
        {isReadOnly && (
          <span className="dashboard-risk-badge completed">
            Read-only
          </span>
        )}
        <span className="review-header-divider" aria-hidden="true">|</span>
        <span className="review-header-toggle-label">Toggle views:</span>
        <div className="review-header-toggle-group" role="tablist" aria-label="Document view">
          <button
            type="button"
            role="tab"
            aria-selected={activeDocTab === 'report'}
            className={`review-header-toggle-btn${activeDocTab === 'report' ? ' active' : ''}`}
            onClick={() => onChangeTab('report')}
          >
            Report
          </button>
          {pdfTabAvailable && (
            <button
              type="button"
              role="tab"
              aria-selected={activeDocTab === 'pdf'}
              className={`review-header-toggle-btn${activeDocTab === 'pdf' ? ' active' : ''}`}
              onClick={() => onChangeTab('pdf')}
            >
              Original PDF
            </button>
          )}
        </div>
        <div className="review-header-right-group">
          {showDeadlinePill && assignment?.deadline_at && (
            <DeadlinePill deadlineAt={assignment.deadline_at} />
          )}
          <button
            type="button"
            className="dashboard-btn-primary review-header-action-btn"
            onClick={onOpenActions}
          >
            {actionButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentPane({
  assignment,
  reportResults,
  focusedPaperId,
  activeDocTab, onChangeTab,
  pdfBlobUrl, pdfLoading, pdfError,
  pdfTabAvailable,
  hasLowEvidence,
}) {
  // Two tabs — Report (default) and Original PDF (auth-gated stream embedded
  // in an iframe). Switching to the PDF tab triggers a lazy fetch in the
  // parent, which converts the blob to an object URL and revokes it on unmount.
  return (
    <div className="dashboard-card">

      {activeDocTab === 'report' && (
        <div>
          {hasLowEvidence && <LowEvidenceBanner />}
          {focusedPaperId != null && (
            <div className="review-detail-pdf-banner">
              Showing report details for one selected source. Click <strong>Show all</strong> in the right panel to reset.
            </div>
          )}
          {assignment?.submission_text ? (
            <SimilarityMatchesReport
              results={reportResults}
              submissionText={assignment.submission_text}
              documentsCompared={
                focusedPaperId == null
                  ? assignment?.documents_compared
                  : reportResults.length
              }
              context="review"
            />
          ) : (
            <div className="review-detail-doc-empty">No content available.</div>
          )}
        </div>
      )}

      {activeDocTab === 'pdf' && (
        <div>
          {pdfLoading && (
            <div className="review-detail-pdf-empty">Loading original PDF…</div>
          )}
          {pdfError && !pdfLoading && (
            <div className="review-detail-pdf-empty">
              {pdfError}{' '}
              <button
                type="button"
                className="dashboard-view-link review-sidebar-reset-btn"
                onClick={() => onChangeTab('report')}
              >
                Back to report
              </button>
            </div>
          )}
          {!pdfLoading && !pdfError && pdfBlobUrl && (
            <iframe
              src={pdfBlobUrl}
              title="Original submission PDF"
              className="review-detail-pdf-frame"
            />
          )}
        </div>
      )}
    </div>
  );
}

function MatchesSidebar({
  assignment, focusedPaperId, expandedPaperId,
  onToggleFocus, onToggleExpand, onOpenReportForPaper,
}) {
  // Per-paper cards with score badges + expandable sentence pairs.
  // Clicking a card toggles the document highlight focus to that paper;
  // clicking a sentence pair focuses the report on that source.
  const matches = assignment?.top_matches || [];
  const reviewRiskOptions = {
    inputScale: SCORE_INPUT_SCALES.RATIO,
    profile: RISK_PROFILES.REVIEW,
    useMaxLogic: true,
  };

  return (
    <div className="dashboard-card">
      <div className="review-sidebar-header">
        <h3 className="review-sidebar-title">
          Similarity Matches{matches.length > 0 ? ` (Top ${matches.length})` : ''}
        </h3>
        {focusedPaperId != null && (
          <button
            type="button"
            className="dashboard-view-link review-sidebar-reset-btn"
            onClick={() => onToggleFocus(null)}
          >
            Show all
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="review-sidebar-empty">
          No similar passages were found in the corpus.
        </p>
      ) : (
        <div className="review-sidebar-list">
          {matches.map((m, i) => {
            const focused = focusedPaperId === m.paper_id;
            const expanded = expandedPaperId === m.paper_id;
            const sentencePairs = (m.match_details && m.match_details.matches) || [];
            const highestSentenceMatch = m.highest_match != null
              ? m.highest_match
              : sentencePairs.length > 0
                ? Math.max(...sentencePairs.map(p => p.similarity || 0))
                : null;
            const docScoreClass = calculateRiskLevel(
                                  m.similarity_score,
                                  highestSentenceMatch,
                                  reviewRiskOptions
                                );
            return (
              <div
                key={m.paper_id ?? i}
                className={`review-detail-match-card${focused ? ' focused' : ''}`}
              >
                <div
                  className="review-detail-match-header"
                  onClick={() => onToggleFocus(m.paper_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleFocus(m.paper_id);
                    }
                  }}
                  title={focused ? 'Click to clear focus' : 'Focus highlights on this paper'}
                >
                  <div className="review-match-info">
                    <div className="review-detail-match-title">
                      {m.title || `Paper #${m.paper_id}`}
                    </div>
                    {m.author && (
                      <div className="review-detail-match-author">{m.author}</div>
                    )}
                  </div>
                  <div className="review-detail-match-stats">
                    <span className={`dashboard-risk-badge ${docScoreClass}`}>
                      {(m.similarity_score * 100).toFixed(1)}%
                    </span>
                    <span className="review-match-sent-label">
                      Top sent.&nbsp;
                      <strong className="review-match-sent-value">
                        {m.highest_match ? `${(m.highest_match * 100).toFixed(1)}%` : '—'}
                      </strong>
                    </span>
                  </div>
                </div>

                {sentencePairs.length > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(m.paper_id); }}
                    className="dashboard-view-link review-match-expand-btn"
                  >
                    {expanded
                      ? `Hide ${sentencePairs.length} sentence pair${sentencePairs.length === 1 ? '' : 's'}`
                      : `Show ${sentencePairs.length} sentence pair${sentencePairs.length === 1 ? '' : 's'}`}
                  </button>
                ) : (
                  <div className="review-match-card-score-only">
                    (doc-level similarity only)
                  </div>
                )}

                {expanded && sentencePairs.length > 0 && (
                  <div className="review-detail-sentence-list">
                    {sentencePairs.map((pair, pi) => {
                      const subSent = pair.submission_sentence || {};
                      const corSent = pair.corpus_sentence || {};
                      const pairPct = typeof pair.similarity === 'number'
                        ? `${(pair.similarity * 100).toFixed(0)}%`
                        : null;
                      return (
                        <div
                          key={pi}
                          className="review-detail-sentence-pair"
                          onClick={() => onOpenReportForPaper(m.paper_id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpenReportForPaper(m.paper_id);
                            }
                          }}
                          title="Open this source in report view"
                        >
                          {pairPct && (
                            <div className="review-match-pair-header">
                              <span><strong className="review-match-sent-value">{pairPct}</strong> match</span>
                            </div>
                          )}
                          <div className="review-detail-sentence-label submission">
                            Submission
                          </div>
                          <div className="review-detail-sentence-text submission">
                            {subSent.text || '\u2014'}
                          </div>
                          <div className="review-detail-sentence-label corpus review-match-pair-label-corpus">
                            Corpus
                          </div>
                          <div className="review-detail-sentence-text corpus">
                            {corSent.text || '\u2014'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeadlinePill({ deadlineAt }) {
  // Subtle pill rendered at the top of the action panel showing how much time
  // the reviewer has left to vote. Turns amber when <24h remain and switches
  // to a neutral "passed" state once the deadline is behind us (the server
  // is the authoritative source on whether the assignment has expired).
  if (!deadlineAt) return null;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return null;
  const ms = deadline.getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  const passed = ms <= 0;
  const timeStr = deadline.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const label = passed ? 'Deadline passed' : `Due ${timeStr}`;
  const urgent = !passed && hours < 24;
  return (
    <div
      className={`review-detail-deadline-pill${urgent ? ' urgent' : ''}${passed ? ' passed' : ''}`}
      title={deadline.toLocaleString()}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {label}
    </div>
  );
}

// Decline-reason taxonomy — keep in sync with backend/config.py::DECLINE_REASON_TAXONOMY.
const DECLINE_REASON_CATEGORIES = [
  { value: 'conflict_of_interest', label: 'Conflict of Interest', excluded: true },
  { value: 'workload',             label: 'Workload too high',     excluded: false },
  { value: 'unavailable',          label: 'Unavailable this week', excluded: false },
  { value: 'other',                label: 'Other (please explain)', excluded: false },
];

function ActionPanel(props) {
  const {
    assignment, isReadOnly, isAssigned, isInactive, alreadyVoted, showVoting,
    voteSuccess, selectedVote, comment, failReasons,
    showDecline, declineReason, declineReasonCategory,
    submitting, voteError, showVoteValidation,
    lifecycleBusy, lifecycleError,
    setShowDecline, setDeclineReason, setDeclineReasonCategory,
    setSelectedVote, setComment, toggleFailReason,
    handleAccept, handleDecline, handleSubmitVote,
    canSubmit,
  } = props;

  const status = assignment?.assignment_status;

  // Explicit named branch — assigned / decline-confirm / accepted / voted /
  // inactive. `alreadyVoted` (which also covers `?readonly=1` and the
  // Completed tab) takes precedence so a read-only revisit always lands on
  // the submitted-review summary even if the underlying status differs.
  let branch;
  if (alreadyVoted) branch = 'voted';
  else if (isInactive && !isReadOnly) branch = 'inactive';
  else if (isAssigned && !isReadOnly && showDecline) branch = 'decline-confirm';
  else if (isAssigned && !isReadOnly) branch = 'assigned';
  else if (showVoting) branch = 'accepted';
  else branch = null;

  return (
    <>
      {/* Branch: inactive — declined or expired */}
      {branch === 'inactive' && (
        <div className="dashboard-card review-action-card-inactive">
          <h3 className="review-action-title">
            Assignment {status === 'declined'
              ? 'Declined'
              : status === 'expired'
                ? 'Expired'
                : 'Closed by Admin'}
          </h3>
          <p className="review-action-text-muted">
            {status === 'declined'
              ? 'You declined this assignment. A replacement reviewer has been notified.'
              : status === 'expired'
                ? 'The deadline has passed and this assignment expired. A replacement reviewer has been notified.'
                : 'The admin has already finalized this submission, so reviewer voting is closed. No action is required from you.'}
            {status === 'declined' && assignment?.decline_reason && (
              <> Reason: <em>{assignment.decline_reason}</em></>
            )}
            {status === 'cancelled' && assignment?.cancellation_reason && (
              <> Reason: <em>{assignment.cancellation_reason === 'admin_finalized_approve'
                              ? 'submission was approved by the admin'
                              : assignment.cancellation_reason === 'admin_finalized_reject'
                                ? 'submission was rejected by the admin'
                                : assignment.cancellation_reason}</em></>
            )}
          </p>
        </div>
      )}

      {/* Branches: assigned + decline-confirm — share the same outer card */}
      {(branch === 'assigned' || branch === 'decline-confirm') && (
        <div className="dashboard-card review-action-card-assigned">
          <h3 className="review-action-title">
            Accept this review assignment
          </h3>
          <p className="review-action-text">
            You have until <strong>{assignment?.deadline_at ? new Date(assignment.deadline_at).toLocaleString() : '—'}</strong> to
            cast your vote. Please accept the assignment to unlock the voting
            panel below, or decline if you cannot review this submission.
          </p>

          {branch === 'assigned' ? (
            <div className="review-action-buttons">
              <button
                onClick={handleAccept}
                disabled={lifecycleBusy}
                className="review-action-btn-accept"
              >
                {lifecycleBusy ? 'Accepting…' : '✓ Accept Assignment'}
              </button>
              <button
                onClick={() => setShowDecline(true)}
                disabled={lifecycleBusy}
                className="review-action-btn-decline"
              >
                Decline
              </button>
            </div>
          ) : (
            <div>
              {/* Decline-handling accountability layer: required structured
                  category. `conflict_of_interest` does NOT count toward
                  the rolling-window pause threshold. */}
              <label className="review-action-label">
                Why are you declining? <span>*</span>
              </label>
              <select
                value={declineReasonCategory || ''}
                onChange={e => setDeclineReasonCategory(e.target.value || null)}
                disabled={lifecycleBusy}
                className="auth-input-field"
              >
                <option value="" disabled>Select a reason…</option>
                {DECLINE_REASON_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}{cat.excluded ? ' — does not count toward pause threshold' : ''}
                  </option>
                ))}
              </select>
              <p className="review-action-text-muted">
                <em>Conflict of Interest</em> and <em>Out of My Expertise</em> are
                considered legitimate declines and are excluded from the pause
                threshold.
              </p>

              <label className="review-action-label">
                Reason for declining (optional, max 500 characters)
              </label>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g., Conflict of interest with the topic; will be unavailable this week…"
                disabled={lifecycleBusy}
                className="review-comment-textarea"
              />
              <div className="review-sidebar-empty review-decline-counter">
                {declineReason.length}/500
              </div>
              <div className="review-action-buttons">
                <button
                  onClick={handleDecline}
                  disabled={lifecycleBusy || !declineReasonCategory}
                  title={!declineReasonCategory ? 'Please select a reason category before confirming.' : undefined}
                  className="review-action-btn-accept review-action-btn-confirm-decline"
                >
                  {lifecycleBusy ? 'Declining…' : 'Confirm Decline'}
                </button>
                <button
                  onClick={() => { setShowDecline(false); setDeclineReason(''); setDeclineReasonCategory(null); }}
                  disabled={lifecycleBusy}
                  className="review-action-btn-decline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {lifecycleError && (
            <p className="review-action-text review-action-error">{lifecycleError}</p>
          )}
        </div>
      )}

      {/* Branch: voted — submitted-review summary (also rendered for the
          read-only Completed-tab revisit). */}
      {branch === 'voted' && (
        <div className="dashboard-card review-action-card-voted">
          <h3 className="review-action-title">
            Your Submitted Review
          </h3>
          <p className="review-action-text">
            <strong>Vote:</strong>{' '}
            <span className={`dashboard-risk-badge ${assignment?.vote === 'pass' ? 'low' : 'high'}`}>
              {assignment?.vote?.toUpperCase() || (voteSuccess ? selectedVote?.toUpperCase() : '—')}
            </span>
          </p>
          {assignment?.comment && (
            <p className="review-action-text">
              <strong>Comment:</strong> {assignment.comment}
            </p>
          )}
          {assignment?.fail_reasons?.length > 0 && (
            <div className="review-action-text">
              <strong>Reasons:</strong>
              <div className="review-action-buttons review-reasons-list">
                {assignment.fail_reasons.map(r => (
                  <span key={r} className="dashboard-risk-badge high review-reason-badge">
                    {FAIL_REASON_LABELS[r] || r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {voteSuccess && (
            <p className="review-action-modal-note review-success-text">
              ✓ Vote submitted successfully. Thank you for your review!
            </p>
          )}
        </div>
      )}

      {/* Branch: accepted — pass/fail vote form (only when not read-only). */}
      {branch === 'accepted' && (
        <div className="dashboard-card review-action-card-accepted">

          {/* Pass / Fail buttons */}
          <div className="review-vote-buttons">
            <button
              onClick={() => { setSelectedVote('pass'); /* failReasons cleared by parent */ }}
              className={`review-vote-btn review-vote-btn--pass${selectedVote === 'pass' ? ' active' : ''}`}
            >
              ✓ Pass
            </button>
            <button
              onClick={() => setSelectedVote('fail')}
              className={`review-vote-btn review-vote-btn--fail${selectedVote === 'fail' ? ' active' : ''}`}
            >
              ✗ Fail
            </button>
          </div>

          {selectedVote === 'fail' && (
            <div className="review-fail-reasons-container">
              <label className="review-action-label">
                Reason(s) for failing <span>*</span>
              </label>
              <div className="review-fail-reason-grid">
                {FAIL_REASON_TAXONOMY.map(reason => (
                  <label key={reason} className="review-fail-reason-item">
                    <input
                      type="checkbox"
                      checked={failReasons.includes(reason)}
                      onChange={() => toggleFailReason(reason)}
                      className="review-decline-radio"
                    />
                    {FAIL_REASON_LABELS[reason]}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="review-comment-container">
            <label className="review-action-label">
              Comment{selectedVote === 'fail' ? <span> * (min 20 chars)</span> : ' (optional)'}
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={
                selectedVote === 'fail'
                  ? 'Explain why this submission fails originality review (required, min 20 characters)…'
                  : 'Optional comments for the admin…'
              }
              className={`review-comment-textarea${selectedVote === 'fail' && comment.trim().length < 20 && comment.length > 0 ? ' error' : ''}`}
            />
            <div className="review-sidebar-header review-comment-footer">
              {selectedVote === 'fail' && comment.trim().length < 20 && comment.length > 0 && (
                <span className="review-match-pair-header review-action-validation-error">
                  {20 - comment.trim().length} more characters required
                </span>
              )}
              <span className="review-sidebar-empty review-comment-counter">
                {comment.length}/1000
              </span>
            </div>
          </div>

          {showVoteValidation && selectedVote === 'fail' && failReasons.length === 0 && (
            <p className="review-sidebar-empty review-action-validation-error">
              Please select at least one reason for failing.
            </p>
          )}

          {voteError && (
            <p className="review-sidebar-empty review-action-error">{voteError}</p>
          )}

          <button
            onClick={handleSubmitVote}
            disabled={!canSubmit() || submitting}
            className="dashboard-btn-primary review-action-open-btn"
          >
            {submitting ? 'Submitting…' : 'Submit Vote'}
          </button>
        </div>
      )}
    </>
  );
}

export default function ReviewDetail() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Defense-in-depth: opening from the Completed tab forces read-only in
  // addition to the explicit `?readonly=1` flag. The server's
  // `MUST_ACCEPT_FIRST` guard remains the authoritative safety net.
  const isReadOnly = searchParams.get('readonly') === '1'
    || searchParams.get('tab') === 'completed';

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Voting state
  const [selectedVote, setSelectedVote] = useState(null);
  const [comment, setComment] = useState('');
  const [failReasons, setFailReasons] = useState([]);
  const [showVoteValidation, setShowVoteValidation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // Lifecycle (accept / decline) state
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState(null);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  // Decline-handling accountability layer: structured decline category.
  // Required by the UI; legitimate categories don't count toward the pause threshold.
  const [declineReasonCategory, setDeclineReasonCategory] = useState(null);

  // Document-pane tab state. The PDF blob is fetched lazily on the first
  // time the reviewer opens the PDF tab and revoked on unmount / tab switch
  // so the file isn't kept pinned in memory.
  const [activeDocTab, setActiveDocTab] = useState('report');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  // Focused paper (filters report view to one paper) and expanded paper
  // (shows the per-paper sentence-pair list in the sidebar card). Two
  // separate IDs so the reviewer can expand a card without changing focus.
  const [focusedPaperId, setFocusedPaperId] = useState(null);
  const [expandedPaperId, setExpandedPaperId] = useState(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const reloadAssignment = () =>
    reviewsAPI.getAssignment(Number(submissionId)).then(res => setAssignment(res.data));

  useEffect(() => {
    reviewsAPI.getAssignment(Number(submissionId))
      .then(res => setAssignment(res.data))
      .catch(err => {
        if (err.response?.status === 403) {
          setError('You do not have an assignment for this submission.');
        } else {
          setError('Failed to load assignment details.');
        }
      })
      .finally(() => setLoading(false));
  }, [submissionId]);

  const handleAccept = async () => {
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await reviewsAPI.acceptAssignment(Number(submissionId));
      await reloadAssignment();
      // Notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      setLifecycleError(err.response?.data?.error || 'Failed to accept assignment.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleDecline = async () => {
    if (declineReason.length > 500) return;
    // Defensive: the Confirm button is already disabled until a category is
    // picked, but this guard ensures programmatic / keyboard fast-paths
    // can't bypass it.
    if (!declineReasonCategory) {
      setLifecycleError('Please select a reason category before confirming.');
      return;
    }
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await reviewsAPI.declineAssignment(
        Number(submissionId),
        declineReason.trim() || null,
        declineReasonCategory,
      );
      // Notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
      // After declining, the reviewer no longer has access; bounce back to the
      // main dashboard with the navbar's "My Reviews" tab pre-selected.
      navigate('/dashboard', { state: { openTab: 'reviewer-work' } });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'INVALID_DECLINE_CATEGORY') {
        setLifecycleError('That decline reason is not recognised. Please pick one from the list.');
      } else {
        setLifecycleError(err.response?.data?.error || 'Failed to decline assignment.');
      }
      setLifecycleBusy(false);
    }
  };

  const toggleFailReason = (reason) => {
    setFailReasons(prev =>
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  };

  const canSubmit = () => {
    if (!selectedVote) return false;
    if (selectedVote === 'fail') {
      if (comment.trim().length < 20) return false;
      if (failReasons.length === 0) return false;
    }
    return true;
  };

  const handleSubmitVote = async () => {
    if (!canSubmit()) { setShowVoteValidation(true); return; }
    setSubmitting(true);
    setVoteError(null);
    try {
      await reviewsAPI.submitVote(
        Number(submissionId),
        selectedVote,
        comment.trim(),
        selectedVote === 'fail' ? failReasons : null
      );
      setVoteSuccess(true);
      // Refresh assignment data
      const res = await reviewsAPI.getAssignment(Number(submissionId));
      setAssignment(res.data);
      // Notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit vote. Please try again.';
      setVoteError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // When the reviewer toggles between Pass/Fail buttons, the existing UX
  // clears the previously-selected fail reasons. Wire that into the
  // ActionPanel via a wrapper so the subcomponent stays presentational.
  const setSelectedVoteAndReset = (vote) => {
    setSelectedVote(vote);
    setShowVoteValidation(false);
    if (vote === 'pass') setFailReasons([]);
  };

  // Keep reviewer report in sync with submitter report renderer. A focused
  // source from the right sidebar narrows the list to a single match card.
  const reportResults = focusedPaperId == null
    ? (assignment?.top_matches || [])
    : (assignment?.top_matches || []).filter(m => m.paper_id === focusedPaperId);

  // Lazy-fetch the original PDF the first time the reviewer opens the PDF
  // tab. Object URL is revoked on unmount to free memory. Deps limited to
  // `activeDocTab` + `submissionId` so the effect runs once per activation.
  useEffect(() => {
    if (activeDocTab !== 'pdf') return undefined;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    reviewsAPI.getAssignmentFile(Number(submissionId))
      .then(res => {
        if (cancelled) return;
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
      })
      .catch(err => {
        if (cancelled) return;
        const code = err.response?.status;
        if (code === 403) {
          setPdfError('You no longer have access to this submission\u2019s PDF.');
        } else if (code === 404) {
          setPdfError('Original PDF unavailable on the server.');
        } else {
          setPdfError('Failed to load the original PDF.');
        }
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeDocTab, submissionId]);

  // Cleanup on unmount: revoke any blob URL we created so the file doesn't
  // stay pinned in memory after the reviewer navigates away.
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const handleChangeDocTab = (next) => {
    if (next === activeDocTab) return;
    if (next === 'report' && pdfBlobUrl) {
      // Free the blob memory when the reviewer goes back to the report tab.
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      setPdfError(null);
    }
    setActiveDocTab(next);
  };

  const handleOpenReportForPaper = (paperId) => {
    if (activeDocTab !== 'report') {
      handleChangeDocTab('report');
    }
    setFocusedPaperId(paperId ?? null);
  };

  const handleToggleFocus = (paperId) => {
    setFocusedPaperId(prev => (prev === paperId ? null : paperId));
  };
  const handleToggleExpand = (paperId) => {
    setExpandedPaperId(prev => (prev === paperId ? null : paperId));
  };

  const status = assignment?.assignment_status;
  const alreadyVoted = status === 'voted' || voteSuccess;
  const isAccepted   = status === 'accepted';
  const isAssigned   = status === 'assigned';
  // 'cancelled' = admin force-promoted/rejected the submission before the
  // reviewer voted. Treat it as a terminal/inactive state alongside
  // declined/expired so the panel renders a clear closure notice instead
  // of an active vote form (the backend now also rejects vote/accept/decline
  // with 'REVIEW_CLOSED_BY_ADMIN').
  const isInactive   = status === 'declined' || status === 'expired' || status === 'cancelled';
  // Voting UI is only available once the reviewer has explicitly accepted.
  const showVoting = !isReadOnly && !alreadyVoted && isAccepted;
  // Declined/expired reviewers should not stream the original file (the
  // backend also enforces this). Hide the PDF tab client-side to avoid
  // a pointless 403 round-trip.
  const pdfTabAvailable = !isInactive;
  const showDeadlinePill = (isAssigned && !isReadOnly) || showVoting;

  const actionButtonLabel = isReadOnly || alreadyVoted
    ? 'View Submitted Review'
    : isAssigned
      ? 'Open Accept / Decline'
      : showVoting
        ? 'Open Voting Panel'
        : 'Open Review Panel';

  const topMatches = assignment?.top_matches || [];
  const hasAnySentencePairs = topMatches.some(m => m.match_details?.matches?.length > 0);
  const hasLowEvidence = topMatches.length > 0 && !hasAnySentencePairs;

  // Auto-switch to the PDF tab when there are no similarity matches at all.
  // NOTE: This useEffect must stay before the early returns to satisfy React's
  // Rules of Hooks — hooks must be called in the same order on every render.
  useEffect(() => {
    if (assignment && assignment.top_matches && assignment.top_matches.length === 0) {
      if (pdfTabAvailable) {
        setActiveDocTab('pdf');
      }
    }
  }, [assignment, pdfTabAvailable]);

  if (loading) return (
    <div className="dashboard-container">
      <div className="dashboard-loading">Loading assignment…</div>
    </div>
  );

  if (error) return (
    <div className="dashboard-container">
      <div className="review-detail-doc-empty">
        <p className="review-action-error">{error}</p>
        <button
          className="dashboard-view-link"
          onClick={() => navigate('/dashboard', { state: { openTab: 'reviewer-work' } })}
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="dashboard-container">
      <ReviewHeader
        assignment={assignment}
        submissionId={submissionId}
        isReadOnly={isReadOnly}
        onBack={() => navigate('/dashboard', { state: { openTab: 'reviewer-work' } })}
        actionButtonLabel={actionButtonLabel}
        onOpenActions={() => setIsActionModalOpen(true)}
        activeDocTab={activeDocTab}
        onChangeTab={handleChangeDocTab}
        pdfTabAvailable={pdfTabAvailable}
        showDeadlinePill={showDeadlinePill}
      />

      {/* Two-pane workspace — document on the left, source-match sidebar on
          the right. Voting/actions open in a modal to preserve horizontal
          space for report analysis. */}
      <div className="review-detail-grid">
        <div className="review-detail-main">
          <DocumentPane
            assignment={assignment}
            reportResults={reportResults}
            focusedPaperId={focusedPaperId}
            activeDocTab={activeDocTab}
            onChangeTab={handleChangeDocTab}
            pdfBlobUrl={pdfBlobUrl}
            pdfLoading={pdfLoading}
            pdfError={pdfError}
            pdfTabAvailable={pdfTabAvailable}
            hasLowEvidence={hasLowEvidence}
          />
        </div>

      </div>

      {isActionModalOpen && (
        <div
          className="review-action-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Review actions"
          onClick={() => setIsActionModalOpen(false)}
        >
          <div
            className="review-action-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="review-action-modal-header">
              <h3>{isReadOnly || alreadyVoted ? 'Submitted Review' : 'Cast Your Vote'}</h3>
              <button
                type="button"
                className="review-action-modal-close"
                onClick={() => setIsActionModalOpen(false)}
                aria-label="Close review actions"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="review-action-modal-body">
              <ActionPanel
                assignment={assignment}
                isReadOnly={isReadOnly}
                isAssigned={isAssigned}
                isInactive={isInactive}
                alreadyVoted={alreadyVoted}
                showVoting={showVoting}
                voteSuccess={voteSuccess}
                selectedVote={selectedVote}
                comment={comment}
                failReasons={failReasons}
                showDecline={showDecline}
                declineReason={declineReason}
                declineReasonCategory={declineReasonCategory}
                submitting={submitting}
                voteError={voteError}
                showVoteValidation={showVoteValidation}
                lifecycleBusy={lifecycleBusy}
                lifecycleError={lifecycleError}
                setShowDecline={setShowDecline}
                setDeclineReason={setDeclineReason}
                setDeclineReasonCategory={setDeclineReasonCategory}
                setSelectedVote={setSelectedVoteAndReset}
                setComment={setComment}
                toggleFailReason={toggleFailReason}
                handleAccept={handleAccept}
                handleDecline={handleDecline}
                handleSubmitVote={handleSubmitVote}
                canSubmit={canSubmit}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
