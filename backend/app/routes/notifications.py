from flask import Blueprint, request, jsonify
from ..models.models import Notification
from ..utils.auth import require_auth, get_current_user, require_admin

notifications_bp = Blueprint('notifications', __name__)

@notifications_bp.route('', methods=['GET'])
@require_auth
def get_notifications():
    """Get notifications for the current user"""
    user = get_current_user()
    limit = int(request.args.get('limit', 20))
    notifications = Notification.get_by_user(user['id'], limit)
    unread_count = Notification.get_unread_count(user['id'])
    return jsonify({
        'notifications': notifications,
        'unread_count': unread_count
    }), 200

@notifications_bp.route('/unread-count', methods=['GET'])
@require_auth
def get_unread_count():
    """Get count of unread notifications for the current user"""
    user = get_current_user()
    count = Notification.get_unread_count(user['id'])
    return jsonify({'count': count}), 200

@notifications_bp.route('/<int:notification_id>/read', methods=['POST'])
@require_auth
def mark_as_read(notification_id):
    """Mark a notification as read"""
    user = get_current_user()
    Notification.mark_as_read(notification_id, user['id'])
    return jsonify({'message': 'Notification marked as read'}), 200

@notifications_bp.route('/read-all', methods=['POST'])
@require_auth
def mark_all_as_read():
    """Mark all notifications as read"""
    user = get_current_user()
    Notification.mark_all_as_read(user['id'])
    return jsonify({'message': 'All notifications marked as read'}), 200

@notifications_bp.route('/<int:notification_id>', methods=['DELETE'])
@require_auth
def delete_notification(notification_id):
    """Delete a notification"""
    user = get_current_user()
    Notification.delete(notification_id, user['id'])
    return jsonify({'message': 'Notification deleted'}), 200

@notifications_bp.route('/admin/user/<int:target_user_id>', methods=['GET'])
@require_admin
def get_user_notifications_for_admin(target_user_id):
    """Get all notifications for a specific user (admin only) — used for application history timeline"""
    notifications = Notification.get_by_user_for_admin(target_user_id)
    return jsonify({'notifications': notifications}), 200
