from flask import Blueprint, request, jsonify

from ..models.models import User
from ..utils.auth import (
    hash_password, verify_password, generate_token, get_current_user,
    require_auth, require_admin
)
from ..utils.database import get_db_connection

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """User registration"""
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not all([username, email, password]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Check if user already exists
    if User.get_by_username(username):
        return jsonify({'error': 'Username already exists'}), 400
    if User.get_by_email(email):
        return jsonify({'error': 'Email already exists'}), 400
    
    try:
        password_hash = hash_password(password)
        user_id = User.create(username, email, password_hash)
        user = User.get_by_id(user_id)
        token = generate_token(user_id, username, user['role'])
        
        return jsonify({
            'message': 'User created successfully',
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'role': user['role']
            }
        }), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@auth_bp.route('/login', methods=['POST'])
def login():
    """User login"""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not all([username, password]):
        return jsonify({'error': 'Username and password required'}), 400
    
    user = User.get_by_username(username)
    if not user:
        return jsonify({'error': "The username you entered isn't connected to an account."}), 401
    
    if user.get('status') == 'blocked':
        return jsonify({'error': 'You have been blocked. Contact support for details.'}), 403
    
    if not verify_password(user['password_hash'], password):
        return jsonify({'error': 'Incorrect password. Please enter the correct password.'}), 401
    
    token = generate_token(user['id'], user['username'], user['role'])
    
    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role']
        }
    }), 200


@auth_bp.route('/me', methods=['GET'])
@require_auth
def get_current_user_info():
    """Get current user information"""
    user = get_current_user()
    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'email': user['email'],
        'role': user['role']
    }), 200


@auth_bp.route('/users', methods=['GET'])
@require_admin
def get_all_users():
    """Get all registered users"""
    users = User.get_all()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get submission counts per user
    cursor.execute('SELECT user_id, COUNT(*) as count FROM submissions GROUP BY user_id')
    submission_counts = {row['user_id']: row['count'] for row in cursor.fetchall()}
    
    # Get paper counts per user
    cursor.execute('SELECT uploaded_by, COUNT(*) as count FROM papers GROUP BY uploaded_by')
    paper_counts = {row['uploaded_by']: row['count'] for row in cursor.fetchall()}
    
    conn.close()

    for user in users:
        user_id = user['id']
        submissions = submission_counts.get(user_id, 0)
        papers = paper_counts.get(user_id, 0)
        user['activity'] = submissions + papers
        
    return jsonify({'users': users}), 200


@auth_bp.route('/users/<int:user_id>/toggle-status', methods=['PUT'])
@require_admin
def toggle_user_status(user_id):
    """Toggle a user's active/blocked status"""
    user = User.get_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    if user['role'] == 'admin':
        return jsonify({'error': 'Cannot modify admin status'}), 403
        
    new_status = 'blocked' if user.get('status', 'active') == 'active' else 'active'
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET status = ? WHERE id = ?', (new_status, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': f'User status changed to {new_status}', 'status': new_status}), 200
