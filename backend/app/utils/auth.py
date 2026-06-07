import re
import jwt
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from flask import request, jsonify
from ...config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
from ..models.models import User


def validate_password(password):
    """Validate password meets complexity requirements.
    Returns (is_valid, error_message) tuple."""
    if not password or len(password) < 8:
        return False, 'Password must be at least 8 characters.'
    if not re.search(r'[A-Z]', password):
        return False, 'Password must contain at least one uppercase letter.'
    if not re.search(r'[a-z]', password):
        return False, 'Password must contain at least one lowercase letter.'
    if not re.search(r'[0-9]', password):
        return False, 'Password must contain at least one digit.'
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':\"\\|,.<>\/?`~]', password):
        return False, 'Password must contain at least one special character (!@#$%^&* etc.).'
    return True, None


def hash_password(password):
    """Hash a password using Werkzeug"""
    return generate_password_hash(password)


def verify_password(password_hash, password):
    """Verify a password against its hash"""
    return check_password_hash(password_hash, password)


def generate_access_token(user_id, username, role):
    """Generate a short-lived access JWT token"""
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'type': 'access',
        'exp': datetime.utcnow() + timedelta(minutes=15),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def generate_refresh_token(user_id):
    """Generate a long-lived refresh JWT token"""
    payload = {
        'user_id': user_id,
        'type': 'refresh',
        'exp': datetime.utcnow() + timedelta(days=30),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token, expected_type='access'):
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get('type') != expected_type:
            return None
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
        if user.get('status') == 'blocked':
            return jsonify({'error': 'Account is blocked'}), 401
        return f(*args, **kwargs)
    return decorated_function


def require_admin(f):
    """Decorator to require admin role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        if user.get('status') == 'blocked':
            return jsonify({'error': 'Account is blocked'}), 401
        if user['role'] != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def require_reviewer(f):
    """Decorator to require reviewer role (reviewers and admins both pass)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        if user.get('status') == 'blocked':
            return jsonify({'error': 'Account is blocked'}), 401
        if user['role'] not in ('reviewer', 'admin'):
            return jsonify({'error': 'Reviewer access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def require_roles(*roles):
    """Decorator factory to require one of the given roles"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            if user.get('status') == 'blocked':
                return jsonify({'error': 'Account is blocked'}), 401
            if user['role'] not in roles:
                return jsonify({'error': f'Access requires one of: {", ".join(roles)}'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator