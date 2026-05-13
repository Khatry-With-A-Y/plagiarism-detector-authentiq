import os
import json
from flask import Blueprint, request, jsonify, send_file
from ..models.models import Submission, User, SimilarityResult, Reviewer, Notification
from ..utils.auth import require_auth, require_admin, require_reviewer, get_current_user
from ..utils.serializers import serialize_assignment, serialize_assignment_list
from datetime import datetime

reviews_bp = Blueprint('reviews', __name__)

@reviews_bp.route('/requests/my', methods=['GET'])
@require_auth
def get_my_requests():
    """Get all review requests (submissions with review status) for the current user"""
    user = get_current_user()
    # In v2, we just filter user's submissions where review_status is not NULL
    from ..models.models import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, filename, review_status, review_requested_at, admin_decision 
        FROM submissions 
        WHERE user_id = ? AND review_status IS NOT NULL
        ORDER BY review_requested_at DESC
    ''', (user['id'],))
    requests = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'requests': requests}), 200

@reviews_bp.route('/submissions/<int:submission_id>/eligibility', methods=['GET'])
@require_auth
def check_eligibility(submission_id):
    """Check if a submission is eligible for peer review"""
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)
    
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
        
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
        
    eligibility = Submission.get_eligibility(submission_id)
    return jsonify(eligibility), 200

@reviews_bp.route('/requests', methods=['POST'])
@require_auth
def create_request():
    """Request peer review for a submission"""
    user = get_current_user()
    data = request.get_json()
    
    if not data or 'submission_id' not in data:
        return jsonify({'error': 'Missing submission_id'}), 400
        
    submission_id = data['submission_id']
    domain_tag = data.get('domain_tag', 'CS')
    
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
        
    if submission['user_id'] != user['id']:
        return jsonify({'error': 'Access denied'}), 403
        
    try:
        Submission.request_review(submission_id, user['id'], domain_tag)

        # Trigger a fresh background re-analysis so reviewers see the best
        # possible evidence when they open the assignment.
        try:
            from .papers import _submission_executor, process_submission_analysis_safe
            _submission_executor.submit(process_submission_analysis_safe, submission_id)
        except Exception:
            # Re-analysis trigger failure must not break the review request creation.
            pass

        return jsonify({
            'message': 'Review request submitted successfully',
            'submission_id': submission_id,
            'status': 'pending'
        }), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@reviews_bp.route('/admin/queue', methods=['GET'])
@require_admin
def get_admin_queue():
    """Get the peer review queue for admin"""
    # Lazy-expire overdue assignments before serving the queue so admins
    # always see fresh attrition state and any auto-backfilled rows.
    try:
        Submission.expire_overdue_assignments()
    except Exception:
        # Sweep failure must not break the queue read.
        pass
    # Decline-handling Step 4: lazy auto-unpause sweep — flips any
    # auto-paused reviewer whose rolling-window count has dropped below
    # HARD_LIMIT back to active. Failure must not break the queue read.
    try:
        Reviewer.sweep_paused_reviewers()
    except Exception:
        pass

    status = request.args.get('status')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))

    queue_data = Submission.get_admin_review_queue(status, page, limit)

    # Parse pool_breakdown JSON server-side so the admin queue UI doesn't
    # have to deal with the raw string.
    for row in queue_data.get('requests', []):
        raw = row.get('pool_breakdown')
        if isinstance(raw, str) and raw:
            try:
                row['pool_breakdown'] = json.loads(raw)
            except Exception:
                row['pool_breakdown'] = None

    return jsonify(queue_data), 200


@reviews_bp.route('/admin/submissions/<int:submission_id>/assign', methods=['POST'])
@require_admin
def assign_reviewers(submission_id):
    """Admin triggers reviewer assignment for a pending review request."""
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
    if submission.get('review_status') not in ('pending', 'insufficient_pool'):
        return jsonify({'error': 'Submission is not in a state that allows assignment'}), 400

    try:
        result = Submission.assign_many(submission_id)
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Assignment failed: {str(e)}'}), 500


@reviews_bp.route('/assignments', methods=['GET'])
@require_reviewer
def list_assignments():
    """Reviewer: list own assignments. Admin: list all (admin sees full data).

    Accepts an optional `?status=` query param with one of `pending`
    (assigned|accepted), `completed` (voted), or `declined_expired`
    (declined|expired|cancelled). Unknown values are ignored (no filter
    applied).

    When no filter is supplied (default view), entries cancelled by an admin
    force-promote/reject are hidden from the reviewer's queue. They are still
    reachable via `?status=declined_expired` so the reviewer can audit why
    the assignment disappeared.
    """
    user = get_current_user()
    page = int(request.args.get('page', 1))
    limit = min(int(request.args.get('page_size', 50)), 100)
    status_filter = request.args.get('status')

    # Lazy-expire overdue assignments before listing so the reviewer never
    # sees a stale 'assigned/accepted' row past its deadline. Backfill is
    # triggered transparently inside the sweep.
    try:
        Submission.expire_overdue_assignments()
    except Exception:
        pass
    # Decline-handling Step 4: lazy auto-unpause sweep alongside expiry.
    try:
        Reviewer.sweep_paused_reviewers()
    except Exception:
        pass

    # Pull a generous page first, then filter in Python — keeps the SQL simple
    # while still giving stable pagination on the client side. Reviewer rosters
    # are O(few hundred) at most, so the in-memory filter is fine.
    data = Submission.get_assignments_for_reviewer(user['id'], page=1, limit=1000)

    status_buckets = {
        'pending':           ('assigned', 'accepted'),
        'completed':         ('voted',),
        'declined_expired':  ('declined', 'expired', 'cancelled'),
    }
    if status_filter in status_buckets:
        bucket = status_buckets[status_filter]
        filtered = [
            a for a in data['assignments']
            if (a.get('assignment_status') or '') in bucket
        ]
    else:
        # Default (unfiltered) view: hide admin-cancelled entries so the
        # reviewer's queue isn't cluttered with assignments that were closed
        # by the admin force-promoting / rejecting. They remain visible
        # under the `declined_expired` terminal tab for auditability.
        filtered = [
            a for a in data['assignments']
            if (a.get('assignment_status') or '') != 'cancelled'
        ]

    total = len(filtered)
    offset = (page - 1) * limit
    page_slice = filtered[offset:offset + limit]

    # Redact through serializer — reviewer sees only their own entry (already filtered by model)
    serialized = []
    for a in page_slice:
        entry = {k: v for k, v in a.items() if k not in (
            'submission_id', 'filename', 'domain_tag', 'review_status', 'review_requested_at'
        )}
        safe = serialize_assignment(entry, 'reviewer')
        safe['submission_id'] = a['submission_id']
        safe['filename'] = a['filename']
        safe['domain_tag'] = a['domain_tag']
        safe['review_status'] = a['review_status']
        safe['review_requested_at'] = a['review_requested_at']
        serialized.append(safe)

    return jsonify({
        'assignments': serialized,
        'total': total,
        'page': page,
        'limit': limit,
        'status_filter': status_filter if status_filter in status_buckets else None,
    }), 200


@reviews_bp.route('/assignments/<int:submission_id>', methods=['GET'])
@require_reviewer
def get_assignment_detail(submission_id):
    """Reviewer: get their assignment detail for a submission (includes top matches)."""
    user = get_current_user()

    detail = Submission.get_assignment_detail(submission_id, user['id'])
    if not detail:
        return jsonify({'error': 'Assignment not found or access denied'}), 403

    # Redact the assignment entry
    entry = {k: v for k, v in detail.items() if k not in (
        'submission_id', 'filename', 'domain_tag', 'review_status', 'review_requested_at'
    )}
    safe = serialize_assignment(entry, 'reviewer')
    safe['submission_id'] = detail['submission_id']
    safe['filename'] = detail['filename']
    safe['domain_tag'] = detail['domain_tag']
    safe['review_status'] = detail['review_status']
    safe['review_requested_at'] = detail['review_requested_at']

    # Attach top similarity matches so reviewer can evaluate the submission
    # Use the softer query variant so doc-level matches appear even without sentence pairs
    results = SimilarityResult.get_by_submission_for_review(submission_id)
    top_matches = []
    for r in results[:10]:
        match_details = {}
        if r.get('match_details'):
            try:
                match_details = json.loads(r['match_details'])
            except Exception:
                pass
        # Expose per-sentence evidence so the reviewer can verify suspect
        # phrases against the corpus. Keep only the keys the UI consumes
        # (`matches` and `submission_highlight_ranges`) to bound payload size.
        slim_details = {
            'matches': match_details.get('matches', []) or [],
            'submission_highlight_ranges':
                match_details.get('submission_highlight_ranges', []) or [],
        }
        top_matches.append({
            'paper_id':         r['paper_id'],
            'title':            r.get('title', ''),
            'author':           r.get('author', ''),
            'similarity_score': r['similarity_score'],
            'highest_match':    match_details.get('highest_match_score', 0),
            'match_details':    slim_details,
        })

    # Attach submission text (for reviewer to read)
    submission = Submission.get_by_id(submission_id)
    safe['submission_text'] = submission.get('content_text', '') if submission else ''
    safe['top_matches'] = top_matches

    # Expose eligibility scores that justified sending the submission to review.
    safe['eligibility'] = Submission.get_eligibility(submission_id)

    return jsonify(safe), 200


@reviews_bp.route('/assignments/<int:submission_id>/vote', methods=['POST'])
@require_reviewer
def submit_vote(submission_id):
    """Reviewer submits a pass/fail vote with comment and optional fail_reasons."""
    user = get_current_user()
    data = request.get_json() or {}

    vote = data.get('vote')
    comment = data.get('comment', '')
    fail_reasons = data.get('fail_reasons')

    if not vote:
        return jsonify({'error': 'vote is required'}), 400

    try:
        result = Submission.submit_vote(submission_id, user['id'], vote, comment, fail_reasons)
        return jsonify(result), 200
    except ValueError as e:
        error_str = str(e)
        if error_str == 'COMMENT_REQUIRED_FOR_FAIL':
            return jsonify({
                'error': 'A comment (≥20 chars) and at least one fail_reason are required for a fail vote',
                'code': 'COMMENT_REQUIRED_FOR_FAIL'
            }), 400
        if error_str == 'MUST_ACCEPT_FIRST':
            return jsonify({
                'error': 'You must accept this assignment before voting.',
                'code': 'MUST_ACCEPT_FIRST'
            }), 400
        if error_str == 'REVIEW_CLOSED_BY_ADMIN':
            # Terminal state — the admin has already approved/rejected
            # this submission, so no further reviewer action is possible.
            return jsonify({
                'error': 'The admin has already finalized this submission. Reviewer voting is closed.',
                'code': 'REVIEW_CLOSED_BY_ADMIN'
            }), 409
        return jsonify({'error': error_str}), 400
    except Exception as e:
        return jsonify({'error': f'Vote submission failed: {str(e)}'}), 500


@reviews_bp.route('/assignments/<int:submission_id>/accept', methods=['POST'])
@require_reviewer
def accept_assignment(submission_id):
    """Reviewer accepts an assigned review (assigned -> accepted)."""
    user = get_current_user()
    try:
        result = Submission.accept_assignment(submission_id, user['id'])
        return jsonify(result), 200
    except ValueError as e:
        code = str(e)
        if code == 'REVIEW_CLOSED_BY_ADMIN':
            return jsonify({
                'error': 'The admin has already finalized this submission. The assignment is closed.',
                'code': 'REVIEW_CLOSED_BY_ADMIN'
            }), 409
        return jsonify({'error': code}), 400
    except Exception as e:
        return jsonify({'error': f'Accept failed: {str(e)}'}), 500


@reviews_bp.route('/assignments/<int:submission_id>/decline', methods=['POST'])
@require_reviewer
def decline_assignment(submission_id):
    """
    Reviewer declines an assignment ('assigned' or 'accepted' -> 'declined').
    Optional body:
        {
            decline_reason: str (<=500 chars),
            decline_reason_category: one of DECLINE_REASON_TAXONOMY
        }
    The structured `decline_reason_category` is required by the UI but the
    server treats it as optional and defaults to 'unspecified' for legacy
    callers. Categories `conflict_of_interest` and `out_of_expertise` are
    excluded from the rolling-window pause threshold.
    Backfill is performed synchronously from the remaining eligible pool.
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    decline_reason = data.get('decline_reason')
    decline_reason_category = data.get('decline_reason_category')

    try:
        result = Submission.decline_assignment(
            submission_id,
            user['id'],
            decline_reason,
            decline_reason_category=decline_reason_category,
        )
        return jsonify(result), 200
    except ValueError as e:
        code = str(e)
        if code == 'REVIEW_CLOSED_BY_ADMIN':
            return jsonify({
                'error': 'The admin has already finalized this submission. The assignment is closed.',
                'code': 'REVIEW_CLOSED_BY_ADMIN'
            }), 409
        if code == 'INVALID_DECLINE_CATEGORY':
            return jsonify({
                'error': 'Unknown decline_reason_category.',
                'code': 'INVALID_DECLINE_CATEGORY'
            }), 400
        return jsonify({'error': code}), 400
    except Exception as e:
        return jsonify({'error': f'Decline failed: {str(e)}'}), 500


@reviews_bp.route('/assignments/<int:submission_id>/file', methods=['GET'])
@require_reviewer
def get_assignment_file(submission_id):
    """Stream the original uploaded PDF for a reviewer's active assignment.

    Auth-gated so the reviewer's two-pane page can embed the document via a
    Bearer-protected blob URL. Admins are always allowed; reviewers are
    allowed only when their assignment status is in {assigned, accepted,
    voted} — declined and expired assignments are denied.
    Returns 403 when not authorized, 404 when the file is missing on disk.
    """
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404

    is_admin = user.get('role') == 'admin'
    if not is_admin:
        detail = Submission.get_assignment_detail(submission_id, user['id'])
        if not detail:
            return jsonify({'error': 'Access denied'}), 403
        active_states = ('assigned', 'accepted', 'voted')
        if detail.get('assignment_status') not in active_states:
            return jsonify({'error': 'Access denied'}), 403

    file_path = submission.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Original file is unavailable'}), 404

    return send_file(
        file_path,
        mimetype='application/pdf',
        as_attachment=False,
        download_name=submission.get('filename') or 'submission.pdf',
    )


@reviews_bp.route('/submissions/<int:submission_id>/panel', methods=['GET'])
@require_auth
def get_submission_panel(submission_id):
    """Submitter post-decision view: pseudonymous panel feedback.

    Returns `Reviewer 1..N`-labelled feedback for the
    owner of the submission. Voter identity is *never* exposed — the
    `serializers.serialize_assignment_list(.., 'owner')` redactor strips
    `reviewer_id` and `reviewer_snapshot`.

    Only available once an admin decision has been recorded (or the panel
    has reached `awaiting_admin`); for in-flight reviews the submitter
    sees an empty panel.
    """
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403

    try:
        votes = json.loads(submission.get('review_votes') or '[]')
    except Exception:
        votes = []

    # Owner-redacted view: pseudonymous, no identity, only voted entries.
    panel = serialize_assignment_list(votes, 'owner')

    return jsonify({
        'submission_id':       submission['id'],
        'filename':            submission['filename'],
        'review_status':       submission.get('review_status'),
        'review_outcome':      submission.get('review_outcome'),
        'pass_votes':          submission.get('pass_votes', 0),
        'fail_votes':          submission.get('fail_votes', 0),
        'review_requested_at': submission.get('review_requested_at'),
        'admin_decision':      submission.get('admin_decision'),
        'admin_decided_at':    submission.get('admin_decided_at'),
        # Surface admin reason only when the decision is final, so submitter
        # sees the rationale they were given.
        'admin_decision_reason': submission.get('admin_decision_reason')
                                 if submission.get('admin_decision')
                                 else None,
        'panel':               panel,
    }), 200


@reviews_bp.route('/admin/submissions/<int:submission_id>', methods=['GET'])
@require_admin
def get_admin_submission_detail(submission_id):
    """Admin: get full review detail for a submission including all reviewer votes."""
    # Lazy-expire overdue assignments before reading detail.
    try:
        Submission.expire_overdue_assignments()
    except Exception:
        pass

    submission = Submission.get_by_id(submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404

    votes_raw = submission.get('review_votes') or '[]'
    try:
        votes = json.loads(votes_raw)
    except Exception:
        votes = []

    # Admin sees all entries with full data
    serialized_votes = serialize_assignment_list(votes, 'admin')

    results = SimilarityResult.get_by_submission(submission_id)
    top_matches = []
    for r in results[:10]:
        match_details = {}
        if r.get('match_details'):
            try:
                match_details = json.loads(r['match_details'])
            except Exception:
                pass
        top_matches.append({
            'paper_id':         r['paper_id'],
            'title':            r.get('title', ''),
            'author':           r.get('author', ''),
            'similarity_score': r['similarity_score'],
            'highest_match':    match_details.get('highest_match_score', 0),
        })

    # Surface pool_breakdown so the admin queue can explain why a submission
    # flipped to insufficient_pool.
    pool_breakdown = None
    if submission.get('pool_breakdown'):
        try:
            pool_breakdown = json.loads(submission['pool_breakdown'])
        except Exception:
            pool_breakdown = None

    return jsonify({
        'submission_id':       submission['id'],
        'filename':            submission['filename'],
        'domain_tag':          submission.get('domain_tag', 'CS'),
        'review_status':       submission.get('review_status'),
        'review_outcome':      submission.get('review_outcome'),
        'pass_votes':          submission.get('pass_votes', 0),
        'fail_votes':          submission.get('fail_votes', 0),
        'review_requested_at': submission.get('review_requested_at'),
        'admin_decision':      submission.get('admin_decision'),
        'admin_decided_at':    submission.get('admin_decided_at'),
        'admin_decision_reason': submission.get('admin_decision_reason'),
        'assignments':         serialized_votes,
        'top_matches':         top_matches,
        'pool_breakdown':      pool_breakdown,
    }), 200


# ---------------------------------------------------------------------------
# Admin Finalize + Promotion Pipeline
# ---------------------------------------------------------------------------

@reviews_bp.route('/admin/submissions/<int:submission_id>/decision', methods=['POST'])
@require_admin
def admin_decide_submission(submission_id):
    """Admin approves or rejects a peer-review request for a submission.

    Body: { decision: 'approve' | 'reject',
            reason?:  str,
            title?:   str,    # approve-only: title for new papers row
            author?:  str,    # approve-only: author for new papers row
            force?:   bool }  # approve-only: bypass DUPLICATE_PAPER guard

    On approve, runs the deterministic Promotion Pipeline (file copy +
    INSERT INTO papers + in-process corpus-cache invalidate) so the next
    similarity request picks up the freshly-promoted paper.
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    decision = data.get('decision')
    reason   = data.get('reason')
    title    = data.get('title')
    author   = data.get('author')
    force    = bool(data.get('force', False))

    try:
        result = Submission.admin_decision(
            submission_id,
            user['id'],
            decision,
            reason=reason,
            title=title,
            author=author,
            force=force,
        )
        return jsonify(result), 200
    except ValueError as e:
        code = str(e)
        # Map well-known sentinels to clear HTTP responses.
        msg_for = {
            'INVALID_DECISION':           ("decision must be 'approve' or 'reject'.", 400),
            'SUBMISSION_NOT_FOUND':       ('Submission not found.', 404),
            'NO_REVIEW_REQUEST':          ('This submission has no peer-review request.', 400),
            'ALREADY_DECIDED':            ('This request has already been decided.', 409),
            'OVERRIDE_REASON_REQUIRED':   ("A reason is required when overriding a request before the panel has finished voting.", 400),
            'DUPLICATE_PAPER':            ('A paper with identical content already exists in the corpus. Pass force=true to override.', 409),
            'NOT_ELIGIBLE_FOR_PROMOTION': ('Submission has no content to promote.', 400),
            'SOURCE_FILE_MISSING':        ('Submission file is missing on disk; cannot copy to corpus.', 500),
        }
        if code in msg_for:
            text, http_code = msg_for[code]
            return jsonify({'error': text, 'code': code}), http_code
        return jsonify({'error': code, 'code': code}), 400
    except Exception as e:
        return jsonify({'error': f'Decision failed: {str(e)}'}), 500


@reviews_bp.route('/assignments/summary', methods=['GET'])
@require_reviewer
def get_assignments_summary():
    """Reviewer: summary counts for navbar badge."""
    # Sweep overdue rows first to keep the badge counts accurate.
    try:
        Submission.expire_overdue_assignments()
    except Exception:
        pass

    user = get_current_user()
    data = Submission.get_assignments_for_reviewer(user['id'], page=1, limit=1000)
    assignments = data['assignments']

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    assigned_count = sum(1 for a in assignments if a.get('assignment_status') == 'assigned')
    accepted_count = sum(1 for a in assignments if a.get('assignment_status') == 'accepted')
    completed_count = sum(1 for a in assignments if a.get('assignment_status') == 'voted')
    # 'cancelled' (admin force-promote/reject) is a terminal state — count it
    # alongside declined/expired so the badge accurately reflects "things
    # that ended without a vote from me".
    declined_or_expired_count = sum(
        1 for a in assignments
        if a.get('assignment_status') in ('declined', 'expired', 'cancelled')
    )
    nearing_deadline_count = sum(
        1 for a in assignments
        if a.get('assignment_status') in ('assigned', 'accepted')
        and a.get('deadline_at') and a['deadline_at'] > now
        # within 12 hours
        and (datetime.fromisoformat(a['deadline_at'].replace('Z', '+00:00')) -
             datetime.now(timezone.utc)).total_seconds() < 12 * 3600
    )

    return jsonify({
        'assigned_count':           assigned_count,
        'accepted_count':           accepted_count,
        'nearing_deadline_count':   nearing_deadline_count,
        'completed_count':          completed_count,
        'declined_or_expired_count': declined_or_expired_count,
    }), 200


@reviews_bp.route('/admin/requests/summary', methods=['GET'])
@require_admin
def get_admin_requests_summary():
    """Admin: summary counts for the navbar badge.

    Returns review-pipeline state at a glance:
      - pending_count:        review_status='pending' (waiting for assignment)
      - assigned_count:       review_status IN ('assigned','under_review')
      - awaiting_admin_count: panel has finished voting, awaiting admin decide
      - insufficient_pool_count: not enough eligible reviewers
      - nearing_deadline_count: assignments with deadline_at within 12h that
                                are still 'assigned' or 'accepted'

    The admin badge goes amber if `awaiting_admin_count > 0` OR
    `nearing_deadline_count > 0` (frontend chooses).
    """
    # Sweep overdue first so counts reflect the post-expiry state.
    try:
        Submission.expire_overdue_assignments()
    except Exception:
        pass

    from ..models.models import get_db_connection
    from datetime import datetime, timezone, timedelta
    import json as _json

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('''
            SELECT review_status, review_votes
            FROM submissions
            WHERE review_status IS NOT NULL
        ''')
        rows = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    pending_count = sum(1 for r in rows if r['review_status'] == 'pending')
    assigned_count = sum(
        1 for r in rows if r['review_status'] in ('assigned', 'under_review')
    )
    awaiting_admin_count = sum(
        1 for r in rows if r['review_status'] == 'awaiting_admin'
    )
    insufficient_pool_count = sum(
        1 for r in rows if r['review_status'] == 'insufficient_pool'
    )

    # Count active assignments whose deadline is within the next 12h.
    cutoff = (datetime.now(timezone.utc) + timedelta(hours=12)).strftime(
        '%Y-%m-%dT%H:%M:%SZ'
    )
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    nearing_deadline_count = 0
    for r in rows:
        if r['review_status'] not in ('assigned', 'under_review'):
            continue
        try:
            votes = _json.loads(r['review_votes'] or '[]')
        except Exception:
            continue
        for v in votes:
            if v.get('assignment_status') not in ('assigned', 'accepted'):
                continue
            d = v.get('deadline_at')
            if d and now < d <= cutoff:
                nearing_deadline_count += 1

    return jsonify({
        'pending_count':           pending_count,
        'assigned_count':          assigned_count,
        'awaiting_admin_count':    awaiting_admin_count,
        'insufficient_pool_count': insufficient_pool_count,
        'nearing_deadline_count':  nearing_deadline_count,
    }), 200


# ---------------------------------------------------------------------------
# Decline-handling accountability layer (Step 4):
# Admin manual waive of a single decline JSON entry inside a submission's
# review_votes. See .junie/plans/decline-handling-implementation.md.
# ---------------------------------------------------------------------------

@reviews_bp.route(
    '/admin/submissions/<int:submission_id>/decline-events/<int:reviewer_id>/waive',
    methods=['POST'],
)
@require_admin
def waive_decline_event(submission_id, reviewer_id):
    """Admin marks a single decline JSON entry inside `submissions.review_votes`
    as waived.

    Effect (atomic, single transaction):
      - the targeted declined entry gets `waived=true`, `waived_by=admin_id`,
        `waived_at=now`;
      - the reviewer's rolling-window countable decline count is recomputed
        (waived entries are excluded);
      - if the reviewer was auto-paused and the recompute now drops them
        below `REVIEWER_DECLINE_HARD_LIMIT`, `users.status` flips back to
        `'active'` and `reviewers.paused_*` is cleared in the same
        transaction.

    Returns:
      200 {submission_id, reviewer_id, waived, pause_verdict, countable_declines}
      404 NOT_FOUND when no matching declined entry exists
      409 ALREADY_WAIVED when the entry was previously waived
    """
    admin = get_current_user()
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404

    try:
        result = Submission.waive_decline_event(
            submission_id, reviewer_id, admin['id']
        )
        return jsonify(result), 200
    except ValueError as e:
        code = str(e)
        if code == 'NOT_FOUND':
            return jsonify({
                'error': 'No matching declined assignment found for this reviewer on this submission.',
                'code':  'NOT_FOUND',
            }), 404
        if code == 'ALREADY_WAIVED':
            return jsonify({
                'error': 'This decline event has already been waived.',
                'code':  'ALREADY_WAIVED',
            }), 409
        return jsonify({'error': code}), 400
    except Exception as e:
        return jsonify({'error': f'Waive failed: {str(e)}'}), 500
