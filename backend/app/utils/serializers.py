"""
serializers.py — single redaction point for review assignment data.

serialize_assignment(entry, viewer_role) is the ONLY place where
reviewer identity, sibling votes, and reviewer_snapshot are filtered.

viewer_role values:
  'reviewer' — the reviewer who owns this assignment entry
  'admin'    — admin sees everything
  'owner'    — submission owner sees pseudonymous post-decision view
"""


def serialize_assignment(entry, viewer_role, assignment_index=None):
    """
    Redact a single review_votes JSON entry based on who is viewing.

    entry          : dict — one element from submissions.review_votes
    viewer_role    : 'reviewer' | 'admin' | 'owner'
    assignment_index: int | None — used for pseudonymous label ('Reviewer 1', ...)
                      only relevant when viewer_role == 'owner'

    Returns a new dict safe to send to the given viewer.
    """
    if viewer_role == 'admin':
        # Admin sees everything — return a clean copy
        return dict(entry)

    if viewer_role == 'reviewer':
        # Reviewer sees their own row but NEVER sibling data.
        # reviewer_snapshot is stripped (admin-only).
        return {
            'assignment_id':     entry.get('assignment_id'),
            'assignment_status': entry.get('assignment_status'),
            'deadline_at':       entry.get('deadline_at'),
            'assigned_at':       entry.get('assigned_at'),
            # Lifecycle timestamps (own data, safe to expose)
            'accepted_at':       entry.get('accepted_at'),
            'declined_at':       entry.get('declined_at'),
            'expired_at':        entry.get('expired_at'),
            'completed_at':      entry.get('completed_at'),
            # Admin-cancellation provenance (so the UI can show
            # "Closed by admin on <date>" instead of a stale 'assigned' row).
            'cancelled_at':         entry.get('cancelled_at'),
            'cancellation_reason':  entry.get('cancellation_reason'),
            'vote':              entry.get('vote'),
            'comment':           entry.get('comment'),
            'fail_reasons':      entry.get('fail_reasons'),
            'decline_reason':    entry.get('decline_reason'),
            'conflict_flag':     entry.get('conflict_flag', 0),
            # reviewer_id included so the frontend can confirm ownership
            'reviewer_id':       entry.get('reviewer_id'),
            # reviewer_snapshot intentionally omitted
        }

    if viewer_role == 'owner':
        # Submission owner sees post-decision feedback with pseudonymous labels.
        # Only expose voted entries; hide identity entirely.
        label = f'Reviewer {assignment_index + 1}' if assignment_index is not None else 'Reviewer'
        return {
            'label':        label,
            'vote':         entry.get('vote'),
            'comment':      entry.get('comment'),
            'fail_reasons': entry.get('fail_reasons'),
            # No reviewer_id, no reviewer_snapshot, no assignment_id
        }

    # Fallback — return nothing sensitive
    return {}


def serialize_assignment_list(entries, viewer_role, viewer_reviewer_id=None):
    """
    Filter and serialize the full review_votes list for a given viewer.

    For 'reviewer' role: returns only the entry belonging to viewer_reviewer_id.
    For 'admin': returns all entries serialized.
    For 'owner': returns all voted entries with pseudonymous labels (post-decision only).
    """
    if viewer_role == 'admin':
        return [serialize_assignment(e, 'admin') for e in entries]

    if viewer_role == 'reviewer':
        if viewer_reviewer_id is None:
            return []
        own = [e for e in entries if e.get('reviewer_id') == viewer_reviewer_id]
        return [serialize_assignment(e, 'reviewer') for e in own]

    if viewer_role == 'owner':
        voted = [e for e in entries if e.get('vote') is not None]
        return [serialize_assignment(e, 'owner', idx) for idx, e in enumerate(voted)]

    return []
