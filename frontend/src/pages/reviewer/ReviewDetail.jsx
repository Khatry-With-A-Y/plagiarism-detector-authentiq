import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { reviewsAPI } from '../../api/reviews';
import HighlightedText from '../../components/HighlightedText';
import '../dashboard.css';

const FAIL_REASON_LABELS = {
  suspected_paraphrase:  'Suspected paraphrasing of existing corpus',
  insufficient_citation: 'Insufficient citation',
  low_content_quality:   'Content quality below threshold',
  out_of_scope:          'Out of CS scope',
  other:                 'Other (see comment)',
};

const FAIL_REASON_TAXONOMY = Object.keys(FAIL_REASON_LABELS);

// ---------------------------------------------------------------------------
// Stage 2: in-file subcomponents — ReviewHeader, DocumentPane, MatchesSidebar,
// ActionPanel — kept inside this file so the page remains a single import.
// At this stage the document pane and matches sidebar still render the same
// content as before; richer behaviour (tabs, highlights, sentence pairs,
// focus filter, scroll-to) is layered on in Stage 3 and Stage 4.
// ---------------------------------------------------------------------------

function ReviewHeader({ assignment, submissionId, isReadOnly, onBack }) {
  return (
    <div className="dashboard-header">
      <div>
        <button
          className="dashboard-view-link"
          style={{ marginBottom: '8px', fontSize: '13px' }}
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>
        <h1 className="dashboard-title">
          {isReadOnly ? 'Submitted Review' : 'Review Assignment'}
        </h1>
        <p className="dashboard-subtitle">
          {assignment?.filename || `Submission #${submissionId}`}
          <span className="dashboard-risk-badge pending"
                style={{ marginLeft: '10px', fontSize: '11px' }}>
            {assignment?.domain_tag || 'CS'}
          </span>
        </p>
      </div>
    </div>
  );
}

function DocumentPane({
  assignment, highlights,
  activeDocTab, onChangeTab,
  pdfBlobUrl, pdfLoading, pdfError,
  pdfTabAvailable,
  highlightedTextRef,
}) {
  // Stage 3: two tabs — Extracted Text (default, highlighted) and Original
  // PDF (auth-gated stream embedded in an iframe). Switching to the PDF tab
  // triggers a lazy fetch in the parent, which converts the blob to an
  // object URL and revokes it on unmount / tab switch.
  return (
    <div className="dashboard-card">
      <div className="review-detail-tabs" role="tablist" aria-label="Document view">
        <button
          type="button"
          role="tab"
          aria-selected={activeDocTab === 'text'}
          className={`review-detail-tab-btn${activeDocTab === 'text' ? ' active' : ''}`}
          onClick={() => onChangeTab('text')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Extracted Text
        </button>
        {pdfTabAvailable && (
          <button
            type="button"
            role="tab"
            aria-selected={activeDocTab === 'pdf'}
            className={`review-detail-tab-btn${activeDocTab === 'pdf' ? ' active' : ''}`}
            onClick={() => onChangeTab('pdf')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Original PDF
          </button>
        )}
      </div>

      {activeDocTab === 'text' && (
        <div>
          {assignment?.submission_text ? (
            <HighlightedText
              ref={highlightedTextRef}
              text={assignment.submission_text}
              highlights={highlights || []}
            />
          ) : (
            <div className="review-detail-doc-empty">No content available.</div>
          )}
        </div>
      )}

      {activeDocTab === 'pdf' && (
        <div>
          <div className="review-detail-pdf-banner">
            Match highlights are only available on the <strong>Extracted Text</strong> tab.
          </div>
          {pdfLoading && (
            <div className="review-detail-pdf-empty">Loading original PDF…</div>
          )}
          {pdfError && !pdfLoading && (
            <div className="review-detail-pdf-empty">
              {pdfError}{' '}
              <button
                type="button"
                className="dashboard-view-link"
                style={{ marginLeft: '6px' }}
                onClick={() => onChangeTab('text')}
              >
                Back to extracted text
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
  onToggleFocus, onToggleExpand, onScrollToSentence,
}) {
  // Stage 4: per-paper cards with score badges + expandable sentence pairs.
  // Clicking a card toggles the document highlight focus to that paper;
  // clicking a sentence pair scrolls the extracted-text viewer to that span.
  const matches = assignment?.top_matches || [];

  return (
    <div className="dashboard-card">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: '12px', gap: '8px',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', margin: 0 }}>
          Similarity Matches{matches.length > 0 ? ` (Top ${matches.length})` : ''}
        </h3>
        {focusedPaperId != null && (
          <button
            type="button"
            className="dashboard-view-link"
            style={{ fontSize: '11px' }}
            onClick={() => onToggleFocus(null)}
          >
            Show all
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
          No similar passages were found in the corpus.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {matches.map((m, i) => {
            const focused = focusedPaperId === m.paper_id;
            const expanded = expandedPaperId === m.paper_id;
            const sentencePairs = (m.match_details && m.match_details.matches) || [];
            const docScoreClass = m.similarity_score >= 0.5 ? 'high' :
                                  m.similarity_score >= 0.2 ? 'medium' : 'low';
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
                  <div style={{ minWidth: 0, flex: 1 }}>
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
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Top sent.&nbsp;
                      <strong style={{ color: '#1e293b' }}>
                        {m.highest_match ? `${(m.highest_match * 100).toFixed(1)}%` : '—'}
                      </strong>
                    </span>
                  </div>
                </div>

                {sentencePairs.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(m.paper_id); }}
                    className="dashboard-view-link"
                    style={{
                      fontSize: '11.5px', marginTop: '8px',
                      padding: 0, background: 'none', border: 'none',
                    }}
                  >
                    {expanded
                      ? `Hide ${sentencePairs.length} sentence pair${sentencePairs.length === 1 ? '' : 's'}`
                      : `Show ${sentencePairs.length} sentence pair${sentencePairs.length === 1 ? '' : 's'}`}
                  </button>
                )}

                {expanded && sentencePairs.length > 0 && (
                  <div className="review-detail-sentence-list">
                    {sentencePairs.map((pair, pi) => {
                      const subSent = pair.submission_sentence || {};
                      const corSent = pair.corpus_sentence || {};
                      const pairPct = typeof pair.similarity === 'number'
                        ? `${(pair.similarity * 100).toFixed(0)}%`
                        : null;
                      const hasSpan = typeof subSent.start === 'number'
                                   && typeof subSent.end === 'number'
                                   && subSent.start < subSent.end;
                      return (
                        <div
                          key={pi}
                          className="review-detail-sentence-pair"
                          onClick={() => {
                            if (hasSpan) {
                              onScrollToSentence({
                                start: subSent.start, end: subSent.end,
                              });
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && hasSpan) {
                              e.preventDefault();
                              onScrollToSentence({
                                start: subSent.start, end: subSent.end,
                              });
                            }
                          }}
                          title={hasSpan ? 'Jump to this sentence in the document' : ''}
                        >
                          {pairPct && (
                            <div style={{
                              display: 'flex', justifyContent: 'flex-end',
                              fontSize: '10.5px', color: '#64748b', marginBottom: '4px',
                            }}>
                              <span><strong style={{ color: '#1e293b' }}>{pairPct}</strong> match</span>
                            </div>
                          )}
                          <div className="review-detail-sentence-label submission">
                            Submission
                          </div>
                          <div className="review-detail-sentence-text submission">
                            {subSent.text || '\u2014'}
                          </div>
                          <div className="review-detail-sentence-label corpus" style={{ marginTop: '8px' }}>
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
  // Stage 5: subtle pill rendered at the top of the action panel showing
  // how much time the reviewer has left to vote. Turns amber when <24h
  // remain and switches to a neutral "passed" state once the deadline is
  // behind us (shown for context — the server is the source of truth on
  // whether the assignment expired).
  if (!deadlineAt) return null;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return null;
  const ms = deadline.getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  const passed = ms <= 0;
  let label;
  if (passed) {
    label = 'Deadline passed';
  } else if (hours < 1) {
    const mins = Math.max(1, Math.round(ms / 60000));
    label = `Vote due in ${mins} min`;
  } else if (hours < 48) {
    label = `Vote due in ${Math.round(hours)} h`;
  } else {
    label = `Vote due in ${Math.round(hours / 24)} d`;
  }
  const urgent = !passed && hours < 24;
  return (
    <div
      className={`review-detail-deadline-pill${urgent ? ' urgent' : ''}`}
      title={deadline.toLocaleString()}
      style={passed ? { background: '#f1f5f9', color: '#64748b' } : undefined}
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

function ActionPanel(props) {
  const {
    assignment, isReadOnly, isAssigned, isInactive, alreadyVoted, showVoting,
    voteSuccess, selectedVote, comment, failReasons,
    showDecline, declineReason,
    submitting, voteError,
    lifecycleBusy, lifecycleError,
    setShowDecline, setDeclineReason,
    setSelectedVote, setComment, toggleFailReason,
    handleAccept, handleDecline, handleSubmitVote,
    canSubmit,
  } = props;

  const status = assignment?.assignment_status;

  // Stage 5: explicit named branch — assigned / decline-confirm / accepted /
  // voted / inactive. `alreadyVoted` (which also covers `?readonly=1` and
  // the Completed tab) takes precedence so a read-only revisit always lands
  // on the submitted-review summary even if the underlying status would
  // have rendered another panel.
  let branch;
  if (alreadyVoted) branch = 'voted';
  else if (isInactive && !isReadOnly) branch = 'inactive';
  else if (isAssigned && !isReadOnly && showDecline) branch = 'decline-confirm';
  else if (isAssigned && !isReadOnly) branch = 'assigned';
  else if (showVoting) branch = 'accepted';
  else branch = null;

  // Stage 5: deadline pill is most relevant before the reviewer votes
  // (assigned / decline-confirm / accepted). Once voted or inactive the
  // deadline isn't actionable anymore, so we hide it.
  const showDeadlinePill = branch === 'assigned'
                        || branch === 'decline-confirm'
                        || branch === 'accepted';

  return (
    <>
      {showDeadlinePill && assignment?.deadline_at && (
        <DeadlinePill deadlineAt={assignment.deadline_at} />
      )}

      {/* Branch: inactive — declined or expired */}
      {branch === 'inactive' && (
        <div className="dashboard-card" style={{
          borderLeft: '4px solid #94a3b8',
          background: '#f8fafc',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
            Assignment {status === 'declined' ? 'Declined' : 'Expired'}
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            {status === 'declined'
              ? 'You declined this assignment. A replacement reviewer has been notified.'
              : 'The deadline has passed and this assignment expired. A replacement reviewer has been notified.'}
            {assignment?.decline_reason && (
              <> Reason: <em>{assignment.decline_reason}</em></>
            )}
          </p>
        </div>
      )}

      {/* Branches: assigned + decline-confirm — share the same outer card */}
      {(branch === 'assigned' || branch === 'decline-confirm') && (
        <div className="dashboard-card" style={{
          borderLeft: '4px solid #1e40af',
          background: '#eff6ff',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
            Accept this review assignment
          </h3>
          <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
            You have until <strong>{assignment?.deadline_at ? new Date(assignment.deadline_at).toLocaleString() : '—'}</strong> to
            cast your vote. Please accept the assignment to unlock the voting
            panel below, or decline if you cannot review this submission.
          </p>

          {branch === 'assigned' ? (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handleAccept}
                disabled={lifecycleBusy}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: lifecycleBusy ? '#94a3b8' : '#10b981',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {lifecycleBusy ? 'Accepting…' : '✓ Accept Assignment'}
              </button>
              <button
                onClick={() => setShowDecline(true)}
                disabled={lifecycleBusy}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#dc2626',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                }}
              >
                Decline
              </button>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                Reason for declining (optional, max 500 characters)
              </label>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g., Conflict of interest with the topic; will be unavailable this week…"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                  marginBottom: '4px',
                }}
              />
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                {declineReason.length}/500
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleDecline}
                  disabled={lifecycleBusy}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: lifecycleBusy ? '#94a3b8' : '#dc2626',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {lifecycleBusy ? 'Declining…' : 'Confirm Decline'}
                </button>
                <button
                  onClick={() => { setShowDecline(false); setDeclineReason(''); }}
                  disabled={lifecycleBusy}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: lifecycleBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {lifecycleError && (
            <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{lifecycleError}</p>
          )}
        </div>
      )}

      {/* Branch: voted — submitted-review summary (also rendered for the
          read-only Completed-tab revisit). */}
      {branch === 'voted' && (
        <div className="dashboard-card" style={{ borderLeft: '4px solid #10b981' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            Your Submitted Review
          </h3>
          <p style={{ marginBottom: '8px' }}>
            <strong>Vote:</strong>{' '}
            <span className={`dashboard-risk-badge ${assignment?.vote === 'pass' ? 'low' : 'high'}`}>
              {assignment?.vote?.toUpperCase() || (voteSuccess ? selectedVote?.toUpperCase() : '—')}
            </span>
          </p>
          {assignment?.comment && (
            <p style={{ marginBottom: '8px', fontSize: '14px', color: '#374151' }}>
              <strong>Comment:</strong> {assignment.comment}
            </p>
          )}
          {assignment?.fail_reasons?.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <strong style={{ fontSize: '13px' }}>Reasons:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {assignment.fail_reasons.map(r => (
                  <span key={r} className="dashboard-risk-badge high" style={{ fontSize: '11px' }}>
                    {FAIL_REASON_LABELS[r] || r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {voteSuccess && (
            <p style={{ marginTop: '12px', color: '#10b981', fontSize: '13px', fontWeight: 500 }}>
              ✓ Vote submitted successfully. Thank you for your review!
            </p>
          )}
        </div>
      )}

      {/* Branch: accepted — pass/fail vote form (only when not read-only). */}
      {branch === 'accepted' && (
        <div className="dashboard-card">
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            Cast Your Vote
          </h3>

          {/* Pass / Fail buttons */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <button
              onClick={() => { setSelectedVote('pass'); /* failReasons cleared by parent */ }}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                border: `2px solid ${selectedVote === 'pass' ? '#10b981' : '#e5e7eb'}`,
                background: selectedVote === 'pass' ? '#f0fdf4' : '#fff',
                color: selectedVote === 'pass' ? '#065f46' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.15s',
              }}
            >
              ✓ Pass
            </button>
            <button
              onClick={() => setSelectedVote('fail')}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                border: `2px solid ${selectedVote === 'fail' ? '#ef4444' : '#e5e7eb'}`,
                background: selectedVote === 'fail' ? '#fef2f2' : '#fff',
                color: selectedVote === 'fail' ? '#991b1b' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.15s',
              }}
            >
              ✗ Fail
            </button>
          </div>

          {/* Fail reasons checklist — only shown when Fail selected */}
          {selectedVote === 'fail' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>
                Reason(s) for failing <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {FAIL_REASON_TAXONOMY.map(reason => (
                  <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={failReasons.includes(reason)}
                      onChange={() => toggleFailReason(reason)}
                      style={{ width: '15px', height: '15px', accentColor: '#1e40af' }}
                    />
                    {FAIL_REASON_LABELS[reason]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Comment box */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
              Comment{selectedVote === 'fail' ? <span style={{ color: '#ef4444' }}> * (min 20 chars)</span> : ' (optional)'}
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
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${selectedVote === 'fail' && comment.trim().length < 20 && comment.length > 0 ? '#ef4444' : '#e5e7eb'}`,
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              {selectedVote === 'fail' && comment.trim().length < 20 && comment.length > 0 && (
                <span style={{ fontSize: '11px', color: '#ef4444' }}>
                  {20 - comment.trim().length} more characters required
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                {comment.length}/1000
              </span>
            </div>
          </div>

          {/* Validation hint */}
          {selectedVote === 'fail' && failReasons.length === 0 && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
              Please select at least one reason for failing.
            </p>
          )}

          {voteError && (
            <p style={{ fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{voteError}</p>
          )}

          <button
            onClick={handleSubmitVote}
            disabled={!canSubmit() || submitting}
            style={{
              padding: '10px 32px',
              borderRadius: '8px',
              border: 'none',
              background: canSubmit() ? '#1e40af' : '#e5e7eb',
              color: canSubmit() ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '14px',
              cursor: canSubmit() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
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
  // Block 7: defense-in-depth — opening from the Completed tab also forces
  // read-only, in addition to the explicit `?readonly=1` flag. The server's
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
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // Block 5: lifecycle (accept / decline) state
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState(null);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Stage 3: document-pane tab state. The PDF blob is fetched lazily on the
  // first time the reviewer activates the PDF tab and revoked on unmount /
  // tab switch so we don't keep the entire file pinned in memory.
  const [activeDocTab, setActiveDocTab] = useState('text');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  // Stage 4: focused paper (filters document highlights to one paper) and
  // expanded paper (shows the per-paper sentence-pair list inside the
  // sidebar card). Two separate IDs because the reviewer may want to expand
  // a card without changing the highlight focus.
  const [focusedPaperId, setFocusedPaperId] = useState(null);
  const [expandedPaperId, setExpandedPaperId] = useState(null);
  const [pendingScrollSpan, setPendingScrollSpan] = useState(null);
  const highlightedTextRef = useRef(null);

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
      // Block 7: notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
    } catch (err) {
      setLifecycleError(err.response?.data?.error || 'Failed to accept assignment.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleDecline = async () => {
    if (declineReason.length > 500) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await reviewsAPI.declineAssignment(Number(submissionId), declineReason.trim() || null);
      // Block 7: notify the navbar badge so it updates immediately.
      window.dispatchEvent(new Event('reviews:summary-refresh'));
      // After declining, the reviewer no longer has access; bounce back to the
      // main dashboard with the navbar's "My Reviews" tab pre-selected.
      navigate('/dashboard', { state: { openTab: 'reviewer-work' } });
    } catch (err) {
      setLifecycleError(err.response?.data?.error || 'Failed to decline assignment.');
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
    if (!canSubmit()) return;
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
      // Block 7: notify the navbar badge so it updates immediately.
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
    if (vote === 'pass') setFailReasons([]);
  };

  // Stage 3 + Stage 4: aggregate every paper's `submission_highlight_ranges`
  // into a single sorted/merged array driving the extracted-text highlights.
  // When `focusedPaperId` is set the array is narrowed to that paper's ranges
  // so the reviewer can isolate which copies came from a specific source.
  const aggregatedHighlights = useMemo(() => {
    const matches = assignment?.top_matches || [];
    const filteredMatches = focusedPaperId == null
      ? matches
      : matches.filter(m => m.paper_id === focusedPaperId);
    const ranges = [];
    for (const m of filteredMatches) {
      const list = m?.match_details?.submission_highlight_ranges;
      if (Array.isArray(list)) {
        for (const r of list) {
          if (r && typeof r.start === 'number' && typeof r.end === 'number'
              && r.start < r.end) {
            ranges.push({
              start: r.start,
              end: r.end,
              similarity: r.similarity,
            });
          }
        }
      }
    }
    // Merge overlapping ranges so HighlightedText doesn't render duplicate
    // marks for the same span (multiple papers can match the same sentence).
    if (ranges.length === 0) return [];
    ranges.sort((a, b) => a.start - b.start);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      const cur = ranges[i];
      if (cur.start <= last.end) {
        last.end = Math.max(last.end, cur.end);
        // Keep the higher similarity so the highlight intensity is honest.
        if ((cur.similarity || 0) > (last.similarity || 0)) {
          last.similarity = cur.similarity;
        }
      } else {
        merged.push({ ...cur });
      }
    }
    return merged;
  }, [assignment, focusedPaperId]);

  // Stage 3: lazy-fetch the original PDF the first time the reviewer opens
  // the PDF tab. Object URL is revoked on unmount to free memory; the same
  // happens when the reviewer leaves the tab via `handleChangeDocTab`.
  // Deps intentionally limited to `activeDocTab` + `submissionId` so the
  // effect runs once per tab activation. `setPdfLoading` inside the body
  // would re-fire the effect (and cancel the in-flight promise) if it were
  // listed as a dep.
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
    if (next === 'text' && pdfBlobUrl) {
      // Free the blob memory when the reviewer goes back to the text tab.
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      setPdfError(null);
    }
    setActiveDocTab(next);
  };

  // Stage 4: when the reviewer clicks a sentence pair, switch to the text
  // tab (PDF tab can't show highlights), record the requested span, and let
  // the effect below scroll to it after the next paint.
  const handleScrollToSentence = (span) => {
    if (!span) return;
    if (activeDocTab !== 'text') handleChangeDocTab('text');
    // Make sure the span's paper is part of the visible highlights —
    // otherwise the reviewer may have it filtered out and the mark
    // wouldn't be in the DOM. Drop the focus filter so the span renders.
    if (focusedPaperId != null) setFocusedPaperId(null);
    setPendingScrollSpan({ ...span, ts: Date.now() });
  };

  // Stage 4: imperative scroll-to logic. Runs when `pendingScrollSpan` or
  // the highlights change. Auto-expands the truncated viewer if the span
  // falls past the truncation limit, then scrolls into view + flashes.
  useEffect(() => {
    if (!pendingScrollSpan) return undefined;
    const ht = highlightedTextRef.current;
    if (!ht) return undefined;
    const text = assignment?.submission_text || '';
    const TRUNCATE_AT = 3000;
    if (pendingScrollSpan.start >= TRUNCATE_AT && text.length > TRUNCATE_AT) {
      ht.expand();
    }
    // Defer to the next animation frame so the (possibly expanded) DOM
    // is committed before we query for the <mark>.
    const raf = requestAnimationFrame(() => {
      const container = ht.getContainer && ht.getContainer();
      if (!container) return;
      // Find a mark whose [start, end] overlaps the requested span.
      const marks = container.querySelectorAll('mark[data-start]');
      let target = null;
      for (const el of marks) {
        const ms = Number(el.getAttribute('data-start'));
        const me = Number(el.getAttribute('data-end'));
        if (Number.isFinite(ms) && Number.isFinite(me)) {
          if (ms === pendingScrollSpan.start && me === pendingScrollSpan.end) {
            target = el;
            break;
          }
          // Fall back to first overlap if no exact match found.
          if (!target && ms < pendingScrollSpan.end && me > pendingScrollSpan.start) {
            target = el;
          }
        }
      }
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('review-detail-flash');
        // Force reflow so the animation re-triggers on repeated clicks.
        // eslint-disable-next-line no-unused-expressions
        target.offsetWidth;
        target.classList.add('review-detail-flash');
        window.setTimeout(() => {
          target.classList.remove('review-detail-flash');
        }, 1600);
      } else {
        // Span isn't in the rendered marks (e.g. data drift) — at least
        // bring the document into view so the reviewer isn't confused.
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setPendingScrollSpan(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollSpan, aggregatedHighlights]);

  const handleToggleFocus = (paperId) => {
    setFocusedPaperId(prev => (prev === paperId ? null : paperId));
  };
  const handleToggleExpand = (paperId) => {
    setExpandedPaperId(prev => (prev === paperId ? null : paperId));
  };

  if (loading) return (
    <div className="dashboard-container">
      <div className="dashboard-loading">Loading assignment…</div>
    </div>
  );

  if (error) return (
    <div className="dashboard-container">
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</p>
        <button
          className="dashboard-view-link"
          onClick={() => navigate('/dashboard', { state: { openTab: 'reviewer-work' } })}
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  const status = assignment?.assignment_status;
  const alreadyVoted = status === 'voted' || voteSuccess;
  const isAccepted   = status === 'accepted';
  const isAssigned   = status === 'assigned';
  const isInactive   = status === 'declined' || status === 'expired';
  // Voting UI is only available once the reviewer has explicitly accepted.
  const showVoting = !isReadOnly && !alreadyVoted && isAccepted;
  // Stage 3: declined/expired reviewers should not stream the original file
  // (the backend also enforces this). Hide the tab on the client to avoid
  // a pointless 403 round-trip.
  const pdfTabAvailable = !isInactive;

  return (
    <div className="dashboard-container">
      <ReviewHeader
        assignment={assignment}
        submissionId={submissionId}
        isReadOnly={isReadOnly}
        onBack={() => navigate('/dashboard', { state: { openTab: 'reviewer-work' } })}
      />

      {/* Stage 2: two-pane workspace — document on the left, sticky sidebar
          (matches + action panel) on the right. Collapses to a single column
          below 1024px via dashboard.css. */}
      <div className="review-detail-grid">
        <div className="review-detail-main">
          <DocumentPane
            assignment={assignment}
            highlights={aggregatedHighlights}
            activeDocTab={activeDocTab}
            onChangeTab={handleChangeDocTab}
            pdfBlobUrl={pdfBlobUrl}
            pdfLoading={pdfLoading}
            pdfError={pdfError}
            pdfTabAvailable={pdfTabAvailable}
            highlightedTextRef={highlightedTextRef}
          />
        </div>

        <aside className="review-detail-sidebar">
          <MatchesSidebar
            assignment={assignment}
            focusedPaperId={focusedPaperId}
            expandedPaperId={expandedPaperId}
            onToggleFocus={handleToggleFocus}
            onToggleExpand={handleToggleExpand}
            onScrollToSentence={handleScrollToSentence}
          />
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
            submitting={submitting}
            voteError={voteError}
            lifecycleBusy={lifecycleBusy}
            lifecycleError={lifecycleError}
            setShowDecline={setShowDecline}
            setDeclineReason={setDeclineReason}
            setSelectedVote={setSelectedVoteAndReset}
            setComment={setComment}
            toggleFailReason={toggleFailReason}
            handleAccept={handleAccept}
            handleDecline={handleDecline}
            handleSubmitVote={handleSubmitVote}
            canSubmit={canSubmit}
          />
        </aside>
      </div>
    </div>
  );
}
