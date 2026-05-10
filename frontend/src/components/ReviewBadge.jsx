import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { reviewsAPI } from '../api/reviews';

/**
 * Block 7: Navbar badge that polls /api/reviews/assignments/summary every 60s
 * (only while the tab is visible) for reviewers, or
 * /api/reviews/admin/requests/summary for admins.
 *
 * Variant decides which endpoint to poll and which "amber" rule to use:
 *   - variant="reviewer" → amber when nearing_deadline_count > 0
 *   - variant="admin"    → amber when awaiting_admin_count > 0 OR
 *                          nearing_deadline_count > 0
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
    const fetcher = variant === 'admin'
      ? reviewsAPI.adminGetRequestsSummary()
      : reviewsAPI.getAssignmentsSummary();
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
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [poll]);

  const target = variant === 'admin' ? '/admin' : '/reviewer';
  const label = labelOverride || (variant === 'admin' ? 'Review Queue' : 'My Reviews');
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
              ? `${count} item${count === 1 ? '' : 's'} to review`
              : (variant === 'admin'
                  ? 'No review items requiring attention'
                  : 'No active review assignments'))}
        className={`dashboard-nav-link${isActive ? ' active' : ''}`}
        style={{
          color: hasAttention ? '#b45309' : undefined,
          backgroundColor: hasAttention ? '#fffbeb' : undefined,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15.5l2 2 4-4" />
        </svg>
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
