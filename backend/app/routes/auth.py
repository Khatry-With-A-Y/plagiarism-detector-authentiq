from flask import Blueprint, request, jsonify

from ..models.models import User
from ..utils.auth import (
    hash_password, verify_password, generate_token, get_current_user,
    require_auth, require_admin
)

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
    if not user or not verify_password(user['password_hash'], password):
        return jsonify({'error': 'Invalid credentials'}), 401
    
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
