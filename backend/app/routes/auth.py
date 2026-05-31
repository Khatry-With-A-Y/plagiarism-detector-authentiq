import os
import time

from flask import Blueprint, request, jsonify, send_from_directory

from ..models.models import User
from ..utils.auth import (
    hash_password, verify_password, generate_access_token, generate_refresh_token,
    verify_token, get_current_user, require_auth, require_admin
)
from ..utils.database import get_db_connection
from ...config import DATA_DIR

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

AVATARS_DIR = DATA_DIR / 'avatars'
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_ALLOWED_MIMES = {'image/jpeg', 'image/png', 'image/webp'}
AVATAR_EXT_MAP = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}


@auth_bp.route('/register', methods=['POST'])
def register():
    """User registration"""
    data = request.get_json()
    username = data.get('username', '').strip() if data.get('username') else None
    email = data.get('email', '').strip() if data.get('email') else None
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
        
        access_token = generate_access_token(user_id, username, user['role'])
        refresh_token = generate_refresh_token(user_id)
        
        resp = jsonify({
            'message': 'User created successfully',
            'token': access_token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'role': user['role']
            }
        })
        
        resp.set_cookie(
            'refresh_token',
            refresh_token,
            httponly=True,
            secure=False,  # Set to True in production
            samesite='Lax',
            max_age=None
        )
        
        return resp, 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@auth_bp.route('/login', methods=['POST'])
def login():
    """User login"""
    data = request.get_json()
    username = data.get('username', '').strip() if data.get('username') else None
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
    
    remember_me = data.get('remember_me', False)
    access_token = generate_access_token(user['id'], user['username'], user['role'])
    refresh_token = generate_refresh_token(user['id'])
    
    resp = jsonify({
        'message': 'Login successful',
        'token': access_token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role']
        }
    })
    
    refresh_expiry = 30 * 24 * 60 * 60 if remember_me else None
    
    resp.set_cookie(
        'refresh_token',
        refresh_token,
        httponly=True,
        secure=False,
        samesite='Lax',
        max_age=refresh_expiry
    )
    
    return resp, 200


@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    """Refresh access token using refresh token in cookie"""
    refresh_token = request.cookies.get('refresh_token')
    if not refresh_token:
        return jsonify({'error': 'Refresh token missing'}), 401
    
    payload = verify_token(refresh_token, expected_type='refresh')
    if not payload:
        return jsonify({'error': 'Invalid or expired refresh token'}), 401
    
    user = User.get_by_id(payload['user_id'])
    if not user or user.get('status') == 'blocked':
        return jsonify({'error': 'User not found or blocked'}), 401
    
    new_access_token = generate_access_token(user['id'], user['username'], user['role'])
    
    return jsonify({
        'token': new_access_token
    }), 200


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout user by clearing refresh token cookie"""
    resp = jsonify({'message': 'Logged out successfully'})
    resp.set_cookie('refresh_token', '', expires=0)
    return resp, 200


@auth_bp.route('/me', methods=['GET'])
@require_auth
def get_current_user_info():
    """Get current user information"""
    user = get_current_user()

    # If the user has no bio set in the users table but is a reviewer,
    # fall back to the bio they submitted in their reviewer application.
    bio = user.get('bio')
    if not bio and user.get('role') == 'reviewer':
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('SELECT bio FROM reviewers WHERE user_id = ?', (user['id'],))
            row = cursor.fetchone()
            conn.close()
            if row and row['bio']:
                bio = row['bio']
        except Exception:
            pass

    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'email': user['email'],
        'role': user['role'],
        'status': user.get('status'),
        'avatar_url': user.get('avatar_url'),
        'bio': bio,
        'created_at': user.get('created_at'),
    }), 200


@auth_bp.route('/me/password', methods=['PUT'])
@require_auth
def change_password():
    """Change the current user's password"""
    user = get_current_user()
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({'error': 'current_password and new_password are required'}), 400

    if not verify_password(user['password_hash'], current_password):
        return jsonify({'error': 'Incorrect current password'}), 400

    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400

    new_hash = hash_password(new_password)
    User.update_password(user['id'], new_hash)
    return jsonify({'message': 'Password updated successfully'}), 200


@auth_bp.route('/me/avatar', methods=['PUT'])
@require_auth
def upload_avatar():
    """Upload or replace the current user's profile picture"""
    user = get_current_user()

    if 'avatar' not in request.files:
        return jsonify({'error': 'No file uploaded (field name must be "avatar")'}), 400

    file = request.files['avatar']
    if not file or not file.filename:
        return jsonify({'error': 'Empty file'}), 400

    # Validate MIME type
    mime = file.content_type or ''
    if mime not in AVATAR_ALLOWED_MIMES:
        return jsonify({'error': 'Unsupported file type. Use JPEG, PNG, or WebP'}), 400

    # Read bytes and enforce size limit
    file_bytes = file.read()
    if len(file_bytes) > AVATAR_MAX_BYTES:
        return jsonify({'error': 'File must be under 2 MB'}), 413

    # Resize with Pillow
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(file_bytes))
        img.thumbnail((400, 400), Image.LANCZOS)
        out = io.BytesIO()
        fmt = {'jpg': 'JPEG', 'png': 'PNG', 'webp': 'WEBP'}[AVATAR_EXT_MAP[mime]]
        img.save(out, format=fmt)
        file_bytes = out.getvalue()
    except Exception as exc:
        return jsonify({'error': f'Image processing failed: {exc}'}), 500

    ext = AVATAR_EXT_MAP[mime]
    filename = f"{user['id']}-{int(time.time())}.{ext}"
    dest = AVATARS_DIR / filename

    # Delete previous avatar file if one exists
    old_url = user.get('avatar_url') or ''
    if old_url:
        old_filename = old_url.split('/')[-1].split('?')[0]
        old_path = AVATARS_DIR / old_filename
        if old_path.exists():
            try:
                os.remove(old_path)
            except OSError:
                pass

    dest.write_bytes(file_bytes)
    avatar_url = f'/api/avatars/{filename}'
    User.update_avatar(user['id'], avatar_url)
    updated_user = User.get_by_id(user['id'])
    return jsonify({
        'message': 'Avatar updated successfully',
        'avatar_url': avatar_url,
        'user': {
            'id': updated_user['id'],
            'username': updated_user['username'],
            'email': updated_user['email'],
            'role': updated_user['role'],
            'status': updated_user.get('status'),
            'avatar_url': updated_user.get('avatar_url'),
            'bio': updated_user.get('bio'),
            'created_at': updated_user.get('created_at'),
        }
    }), 200


@auth_bp.route('/me/avatar', methods=['DELETE'])
@require_auth
def delete_avatar():
    """Remove the current user's profile picture (revert to initials)"""
    user = get_current_user()

    old_url = user.get('avatar_url') or ''
    if old_url:
        old_filename = old_url.split('/')[-1].split('?')[0]
        old_path = AVATARS_DIR / old_filename
        if old_path.exists():
            try:
                os.remove(old_path)
            except OSError:
                pass

    User.remove_avatar(user['id'])
    updated_user = User.get_by_id(user['id'])
    return jsonify({
        'message': 'Avatar removed',
        'user': {
            'id': updated_user['id'],
            'username': updated_user['username'],
            'email': updated_user['email'],
            'role': updated_user['role'],
            'status': updated_user.get('status'),
            'avatar_url': updated_user.get('avatar_url'),
            'bio': updated_user.get('bio'),
            'created_at': updated_user.get('created_at'),
        }
    }), 200


@auth_bp.route('/me/bio', methods=['PUT'])
@require_auth
def update_bio():
    """Update the current user's bio / about text"""
    user = get_current_user()
    data = request.get_json()
    if data is None:
        return jsonify({'error': 'Request body required'}), 400

    bio = data.get('bio', '')

    # Reviewers must provide a non-empty bio
    if user.get('role') == 'reviewer' and not bio.strip():
        return jsonify({'error': 'Bio is required for reviewers'}), 400

    if len(bio) > 500:
        return jsonify({'error': 'Bio must be 500 characters or fewer'}), 400

    User.update_bio(user['id'], bio)
    updated_user = User.get_by_id(user['id'])
    return jsonify({
        'message': 'Bio updated successfully',
        'user': {
            'id': updated_user['id'],
            'username': updated_user['username'],
            'email': updated_user['email'],
            'role': updated_user['role'],
            'status': updated_user.get('status'),
            'avatar_url': updated_user.get('avatar_url'),
            'bio': updated_user.get('bio'),
            'created_at': updated_user.get('created_at'),
        }
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
    """Toggle a user's blocked/active status.

    Paused reviewers also block through this route so the admin modal can
    reuse one confirmation flow for both active and paused accounts.
    """
    user = User.get_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    if user['role'] == 'admin':
        return jsonify({'error': 'Cannot modify admin status'}), 403
        
    new_status = 'active' if user.get('status', 'active') == 'blocked' else 'blocked'
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET status = ? WHERE id = ?', (new_status, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': f'User status changed to {new_status}', 'status': new_status}), 200
