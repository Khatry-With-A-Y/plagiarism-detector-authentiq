from flask import Blueprint, request, jsonify
from ..models.models import Reviewer, Institution, User, Notification
from ..utils.auth import get_current_user, require_auth, require_admin
from ..utils.mailer import send_verification_email
import json
from ...config import DOMAIN_TAGS, BIO_MAX_LEN

reviewers_bp = Blueprint('reviewers', __name__, url_prefix='/api/reviewers')

@reviewers_bp.route('/institutions', methods=['GET'])
def get_institutions():
    """Get list of allowed institutions"""
    institutions = Institution.get_allowed()
    return jsonify([{'name': name, 'domain': domain} for name, domain in institutions]), 200

@reviewers_bp.route('/apply', methods=['POST'])
@require_auth
def apply():
    """Submit a reviewer application"""
    user = get_current_user()
    data = request.get_json()
    
    # Required fields
    institution_domain = data.get('institution_domain')
    institution_name = data.get('institution_name')
    affiliation = data.get('affiliation')
    institutional_email = data.get('institutional_email')
    bio = data.get('bio', '')
    expertise_tags = data.get('expertise_tags', ['CS'])
    
    if not all([institution_domain, institution_name, affiliation, institutional_email]):
        return jsonify({'error': 'Missing required fields'}), 400
        
    # Validate domain
    allowed_institutions = Institution.get_allowed()
    allowed_domains = [domain for _, domain in allowed_institutions]
    
    # Subdomain boundary check: email must end with @domain or .domain
    domain_match = False
    institutional_email_lower = institutional_email.lower()
    for domain in allowed_domains:
        if institutional_email_lower.endswith('@' + domain) or institutional_email_lower.endswith('.' + domain):
            domain_match = True
            break
            
    if not domain_match:
        return jsonify({'error': 'Email domain must belong to an allowed institution'}), 400
        
    # Validate bio length
    if len(bio) > BIO_MAX_LEN:
        return jsonify({'error': f'Bio must be under {BIO_MAX_LEN} characters'}), 400
        
    # Validate tags
    if not all(tag in DOMAIN_TAGS for tag in expertise_tags):
        return jsonify({'error': 'Invalid expertise tags'}), 400

    try:
        raw_token = Reviewer.apply(
            user['id'], institution_domain, institution_name, affiliation,
            institutional_email, bio, expertise_tags
        )

        # If a token was issued, send (or dev-dump) the verification link.
        # Mailer failures are surfaced to the client so they can retry — the
        # row is already persisted, so a follow-up resubmit just rotates the
        # token via the `Reviewer.apply` upsert.
        email_verification_required = raw_token is not None
        if email_verification_required:
            try:
                send_verification_email(institutional_email, raw_token)
            except Exception as e:
                return jsonify({
                    'error': f'Application saved, but verification email could not be sent: {e}'
                }), 500

        # Create notification for the user
        if email_verification_required:
            notif_message = (
                'Your reviewer application has been submitted. '
                'Please check your institutional inbox to verify your email '
                'before an admin can review the application.'
            )
            message = (
                'Application submitted. Check your institutional inbox to '
                'verify your email before admin review.'
            )
        else:
            notif_message = (
                'Your application to become a reviewer has been submitted '
                'successfully and is now pending admin review.'
            )
            message = 'Application submitted successfully'

        Notification.create(
            user['id'],
            'Reviewer Application Submitted',
            notif_message,
            'info'
        )

        return jsonify({
            'message': message,
            'email_verification_required': email_verification_required,
        }), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

@reviewers_bp.route('/applications/my', methods=['GET'])
@require_auth
def my_application():
    """Get current user's application status"""
    user = get_current_user()
    app = Reviewer.get_by_user_id(user['id'])
    if not app:
        return jsonify({'application_status': 'none'}), 200
    return jsonify(app), 200


@reviewers_bp.route('/applications/my/resend-verification', methods=['POST'])
@require_auth
def resend_verification():
    """Resend the institutional-email verification link to the current applicant.

    Enforced by `Reviewer.resend_verification`:
      - 60s cooldown between two consecutive sends.
      - 5 sends per rolling 24h window (covers initial /apply + resends + edits).
    Rate-limit failures return HTTP 429 with a `retry_after` (seconds) payload
    so the frontend can disable the button and show a live countdown.
    """
    user = get_current_user()
    try:
        result = Reviewer.resend_verification(user['id'])
    except ValueError as e:
        # `Reviewer._check_resend_rate_limit` raises ValueError with
        # `args = (human_message, {retry_after, reason, ...})`. Using
        # `str(e)` on such a tuple-args ValueError stringifies the
        # whole tuple, producing terminal-looking output like
        # "('Please wait 52 seconds…', {'retry_after': 52, …})".
        # Pull the human sentence out of args[0] instead so the JSON
        # `error` payload is a clean, UI-friendly string.
        msg = e.args[0] if e.args else ''
        # Rate-limit errors carry an extra structured payload as args[1].
        details = e.args[1] if len(e.args) > 1 and isinstance(e.args[1], dict) else None
        if details and 'retry_after' in details:
            return jsonify({
                'error':       msg,
                'retry_after': details['retry_after'],
                'reason':      details.get('reason'),
            }), 429
        if msg == 'not_found':
            return jsonify({'error': 'No reviewer application found.'}), 404
        if msg == 'not_pending':
            return jsonify({
                'error': 'Verification link can only be resent while the application is pending.'
            }), 400
        if msg == 'already_verified':
            return jsonify({
                'error': 'Your institutional email is already verified.'
            }), 400
        return jsonify({'error': msg or 'Could not resend the verification link.'}), 400

    try:
        send_verification_email(result['institutional_email'], result['raw_token'])
    except Exception as e:
        # The token has been persisted; expose the mailer error so the
        # user can retry. Note the counter has already been bumped — this
        # is intentional to prevent abuse via a flapping SMTP relay.
        return jsonify({
            'error': f'Verification email could not be sent right now: {e}'
        }), 500

    return jsonify({
        'message':             'A new verification link has been sent to your institutional inbox.',
        'institutional_email': result['institutional_email'],
    }), 200


@reviewers_bp.route('/applications/my/email', methods=['PUT'])
@require_auth
def update_application_email():
    """Let an applicant correct the institutional email on a pending application.

    Body: {"institutional_email": "new@allowed-domain"}.

    Resets `email_verified` to 0, rotates the verification token, and
    sends a fresh link to the new address (counted against the resend
    quota — see `Reviewer.update_email`).
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    new_email = (data.get('institutional_email') or '').strip()
    if not new_email:
        return jsonify({'error': 'Missing institutional_email.'}), 400

    try:
        result = Reviewer.update_email(user['id'], new_email)
    except ValueError as e:
        # Same rationale as in `resend_verification`: rate-limit
        # ValueErrors carry `args = (human_message, {retry_after, ...})`,
        # so `str(e)` would produce a Python-tuple-looking string. Pull
        # the human sentence from `args[0]` so the JSON `error` stays UI-friendly.
        msg = e.args[0] if e.args else ''
        details = e.args[1] if len(e.args) > 1 and isinstance(e.args[1], dict) else None
        if details and 'retry_after' in details:
            return jsonify({
                'error':       msg,
                'retry_after': details['retry_after'],
                'reason':      details.get('reason'),
            }), 429
        if msg == 'not_found':
            return jsonify({'error': 'No reviewer application found.'}), 404
        if msg == 'not_pending':
            return jsonify({
                'error': 'The email can only be changed while the application is pending admin review.'
            }), 400
        if msg == 'already_verified':
            return jsonify({
                'error': 'Your institutional email is already verified and locked.'
            }), 400
        if msg == 'invalid_domain':
            return jsonify({
                'error': 'Email domain must belong to an allowed institution.'
            }), 400
        if msg == 'same_email':
            return jsonify({
                'error': 'This is already the email on your application.'
            }), 400
        if msg == 'email_taken':
            return jsonify({
                'error': 'That institutional email is already in use by another applicant.'
            }), 409
        if msg == 'invalid_email':
            return jsonify({'error': 'Missing institutional_email.'}), 400
        return jsonify({'error': msg or 'Could not update the email.'}), 400

    try:
        send_verification_email(result['institutional_email'], result['raw_token'])
    except Exception as e:
        return jsonify({
            'error': f'Email updated, but the verification message could not be sent: {e}'
        }), 500

    return jsonify({
        'message':             'Email updated. A new verification link has been sent to your institutional inbox.',
        'institutional_email': result['institutional_email'],
    }), 200


@reviewers_bp.route('/verify-email', methods=['POST'])
@require_auth
def verify_email():
    """Consume an institutional-email verification token.

    Body: {"token": "..."}.

    The token is bound to the currently logged-in user: we look up the
    reviewer row by `user_id`, then compare the SHA-256 hash of the
    submitted token to the stored hash. This means a leaked link cannot
    verify someone else's application — the attacker would also need to
    be authenticated as the original applicant.
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()

    if not token:
        return jsonify({'error': 'Missing verification token.'}), 400

    try:
        Reviewer.consume_email_verification(user['id'], token)
    except ValueError as e:
        msg = str(e)
        if msg == 'expired':
            return jsonify({
                'error': 'This verification link has expired. Please resubmit your application to get a new link.'
            }), 400
        # 'invalid' and any other unexpected validation error:
        return jsonify({
            'error': 'This verification link is invalid or has already been used.'
        }), 400

    Notification.create(
        user['id'],
        'Institutional Email Verified',
        'Your institutional email has been verified. Your reviewer application is now pending admin review.',
        'success'
    )

    return jsonify({'message': 'Email verified.'}), 200

@reviewers_bp.route('/admin/applications', methods=['GET'])
@require_admin
def list_applications():
    """List all applications for admin"""
    status = request.args.get('status')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    
    apps, total = Reviewer.list_applications(status, page, limit)
    return jsonify({
        'applications': apps,
        'total': total,
        'page': page,
        'limit': limit
    }), 200

@reviewers_bp.route('/admin/applications/<int:target_user_id>/decision', methods=['POST'])
@require_admin
def decide_application(target_user_id):
    """Admin decision on application"""
    admin = get_current_user()
    data = request.get_json()
    decision = data.get('decision') # 'approved' or 'rejected'
    reason = data.get('reason')
    
    if decision not in ['approved', 'rejected']:
        return jsonify({'error': 'Invalid decision'}), 400

    try:
        Reviewer.decide(target_user_id, admin['id'], decision, reason)

        # Create notification for the user
        if decision == 'approved':
            title = 'Reviewer Application Approved'
            message = 'Congratulations! Your application to become a reviewer has been approved. You now have reviewer privileges.'
            notif_type = 'success'
        else:
            title = 'Reviewer Application Rejected'
            message = f'Your application to become a reviewer was not approved. Reason: {reason or "No specific reason provided."}'
            notif_type = 'warning'

        Notification.create(target_user_id, title, message, notif_type)

        return jsonify({'message': f'Application {decision}'}), 200
    except ValueError as e:
        # Defense-in-depth: the model raises ValueError when an admin tries
        # to approve an applicant whose institutional email is not verified.
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@reviewers_bp.route('/admin/<int:target_user_id>/revoke', methods=['POST'])
@require_admin
def revoke_reviewer(target_user_id):
    """Block 7 (Stage 7c): admin revokes a reviewer's status.

    Effect, all in a single transaction:
      - reviewers.revoked_at = now
      - reviewers.revoked_by = admin id
      - reviewers.revoke_reason = optional reason
      - reviewers.application_status = 'rejected'
      - users.role = 'user'

    Historical `review_votes` JSON entries are NOT touched — the embedded
    `reviewer_snapshot` (captured at assignment time) preserves the audit
    trail even though the user's role has changed.
    """
    admin = get_current_user()
    data = request.get_json(silent=True) or {}
    reason = data.get('reason')

    # Don't let an admin revoke themselves accidentally.
    if target_user_id == admin['id']:
        return jsonify({'error': 'You cannot revoke your own reviewer status.'}), 400

    target = Reviewer.get_by_user_id(target_user_id)
    if not target:
        return jsonify({'error': 'Reviewer not found'}), 404
    if target.get('revoked_at'):
        return jsonify({'error': 'Reviewer is already revoked.'}), 409
    if target.get('application_status') != 'approved':
        return jsonify({
            'error': 'Only approved reviewers can be revoked.'
        }), 400

    try:
        Reviewer.revoke(target_user_id, admin['id'], reason)
        Notification.create(
            target_user_id,
            'Reviewer Status Revoked',
            (
                'Your reviewer privileges have been revoked by an administrator.'
                + (f' Reason: {reason}' if reason else '')
            ),
            'warning',
        )
        return jsonify({
            'message':       'Reviewer status revoked.',
            'user_id':       target_user_id,
            'revoked_by':    admin['id'],
            'revoke_reason': reason,
        }), 200
    except Exception as e:
        return jsonify({'error': f'Revoke failed: {str(e)}'}), 500
