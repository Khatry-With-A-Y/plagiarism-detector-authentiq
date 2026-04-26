from flask import Blueprint, request, jsonify
from ..models.models import Submission, User
from ..utils.auth import require_auth, require_admin, get_current_user
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
    status = request.args.get('status')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    
    queue_data = Submission.get_admin_review_queue(status, page, limit)
    return jsonify(queue_data), 200
