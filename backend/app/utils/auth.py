import jwt
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from flask import request, jsonify
from ...config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
from ..models.models import User


def hash_password(password):
    """Hash a password using Werkzeug"""
    return generate_password_hash(password)


def verify_password(password_hash, password):
    """Verify a password against its hash"""
    return check_password_hash(password_hash, password)


def generate_token(user_id, username, role):
    """Generate a JWT token for a user"""
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token):
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_current_user():
    """Get current user from JWT token in request headers"""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    
    try:
        # Extract token from "Bearer <token>" format
        token = auth_header.split(' ')[1] if ' ' in auth_header else auth_header
        payload = verify_token(token)
        if payload:
            return User.get_by_id(payload['user_id'])
    except Exception:
        pass
    
    return None


def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


def require_admin(f):
    """Decorator to require admin role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        if user['role'] != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function