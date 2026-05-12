import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { reviewsAPI } from '../api/reviews';
import { reviewersAPI } from '../api/reviewers';

/**
 * Block 7: Navbar badge that polls /api/reviews/assignments/summary every 60s
 * (only while the tab is visible) for reviewers, or
 * /api/reviews/admin/requests/summary for admins, or
 * /api/reviewers/admin/applications?status=pending for reviewer onboarding.
 *
 * Variant decides which endpoint to poll and which "amber" rule to use:
 *   - variant="reviewer"             → amber when nearing_deadline_count > 0
 *   - variant="admin"                → amber when awaiting_admin_count > 0 OR
 *                                      nearing_deadline_count > 0
 *   - variant="reviewer-applications" → count = pending applications total;
 *                                       not amber (no deadline pressure).
 *
 * Renders as an inline pill linking to /reviewer or /admin?tab=review-queue.
 * Hidden when there's nothing to show (count = 0) to avoid noise.
 */
export default function ReviewBadge({
  variant = 'reviewer',
  mode = 'pill',
  alwaysVisible = false,
  labelOverride = null,
  onClick = null,
  isActive = false,
}) {
  const [count, setCount] = useState(0);
  const [amber, setAmber] = useState(false);

  const poll = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    let fetcher;
    if (variant === 'admin') {
      fetcher = reviewsAPI.adminGetRequestsSummary();
    } else if (variant === 'reviewer-applications') {
      // Block 7 (Stage 7c): page=1 returns the `total` count of pending
      // reviewer applications regardless of the page slice — that's all
      // we need to drive the navbar badge number.
      fetcher = reviewersAPI.adminListApplications('pending', 1);
    } else {
      fetcher = reviewsAPI.getAssignmentsSummary();
    }
    fetcher
      .then(res => {
        const s = res.data || {};
        if (variant === 'admin') {
          // Admin: count = items needing attention.
          const c = (s.pending_count || 0)
                  + (s.awaiting_admin_count || 0)
                  + (s.insufficient_pool_count || 0);
          setCount(c);
          setAmber((s.awaiting_admin_count || 0) > 0
                || (s.nearing_deadline_count || 0) > 0);
        } else if (variant === 'reviewer-applications') {
          // Reviewer onboarding: count = total pending applications.
          // Not amber — no deadline pressure on application review.
          setCount(s.total || 0);
          setAmber(false);
        } else {
          // Reviewer: count = assigned + accepted (active workload).
          const c = (s.assigned_count || 0) + (s.accepted_count || 0);
          setCount(c);
          setAmber((s.nearing_deadline_count || 0) > 0);
        }
      })
      .catch(() => { /* badge is best-effort; keep last known state */ });
  }, [variant]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 60000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    // Block 7: any code path that mutates review-queue / reviewer-onboarding
    // state dispatches a refresh event so the navbar count updates
    // immediately instead of waiting for the 60s polling tick.
    //   - 'reviews:summary-refresh'   → admin/reviewer review-queue badges
    //   - 'reviewer-apps:refresh'     → reviewer-applications badge
    const onSummaryRefresh = () => poll();
    const refreshEventName = variant === 'reviewer-applications'
      ? 'reviewer-apps:refresh'
      : 'reviews:summary-refresh';
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(refreshEventName, onSummaryRefresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(refreshEventName, onSummaryRefresh);
    };
  }, [poll, variant]);

  // Admin tabs (`admin`, `reviewer-applications`) all live under /admin
  // and use the parent `onClick` to switch active tab.
  const target = (variant === 'admin' || variant === 'reviewer-applications')
    ? '/admin'
    : '/reviewer';
  let defaultLabel = 'My Reviews';
  if (variant === 'admin') defaultLabel = 'Review Queue';
  else if (variant === 'reviewer-applications') defaultLabel = 'Reviewer Onboarding';
  const label = labelOverride || defaultLabel;
  // Variant-specific icon for nav rendering. The reviewer-applications tab
  // uses a person+check icon (matching the original Reviewer Onboarding
  // button); the others keep the existing file/check icon.
  const navIcon = variant === 'reviewer-applications' ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15.5l2 2 4-4" />
    </svg>
  );
  const hasAttention = count > 0 && amber;
  const displayCount = count > 99 ? '99+' : String(count);
  const countBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: hasAttention ? '#f59e0b' : '#1e40af',
    color: '#fff',
    borderRadius: '999px',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    textAlign: 'center',
  };

  if (!alwaysVisible && count <= 0) return null;

  if (mode === 'nav') {
    return (
      <Link
        to={target}
        onClick={(e) => {
          if (!onClick) return;
          e.preventDefault();
          onClick(e);
        }}
        title={hasAttention
          ? (variant === 'admin'
              ? 'Action needed in the review queue'
              : 'You have assignments nearing their deadline')
          : (count > 0
              ? (variant === 'reviewer-applications'
                  ? `${count} pending application${count === 1 ? '' : 's'}`
                  : `${count} item${count === 1 ? '' : 's'} to review`)
              : (variant === 'admin'
                  ? 'No review items requiring attention'
                  : (variant === 'reviewer-applications'
                      ? 'No pending reviewer applications'
                      : 'No active review assignments')))}
        className={`dashboard-nav-link${isActive ? ' active' : ''}`}
        style={{
          color: hasAttention ? '#b45309' : undefined,
          backgroundColor: hasAttention ? '#fffbeb' : undefined,
        }}
      >
        {navIcon}
        <span>{label}</span>
        {count > 0 && (
          <span style={{
            ...countBadgeStyle,
            marginLeft: '2px',
          }}>
            {displayCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      to={target}
      title={hasAttention
        ? (variant === 'admin'
            ? 'Action needed in the review queue'
            : 'You have assignments nearing their deadline')
        : `${count} item${count === 1 ? '' : 's'} to review`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        marginRight: '12px',
        borderRadius: '999px',
        textDecoration: 'none',
        fontSize: '12px',
        fontWeight: 600,
        background: hasAttention ? '#fffbeb' : '#eff6ff',
        color:      hasAttention ? '#b45309' : '#1e40af',
        border: `1px solid ${hasAttention ? '#fde68a' : '#bfdbfe'}`,
        transition: 'all 0.15s',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 15.5l2 2 4-4" />
      </svg>
      <span>{label}</span>
      <span style={countBadgeStyle}>
        {displayCount}
      </span>
    </Link>
  );
}
