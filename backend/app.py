import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from pathlib import Path
from datetime import datetime

from backend.config import (
    UPLOAD_FOLDER, CORPUS_FOLDER, MAX_FILE_SIZE, ALLOWED_EXTENSIONS,
    CORS_ORIGINS
)
from backend.database import init_database, get_db_connection
from backend.models import User, Paper, Submission, SimilarityResult
from backend.auth import (
    hash_password, verify_password, generate_token, get_current_user,
    require_auth, require_admin
)
from backend.file_processor import extract_text, validate_file
from backend.similarity import process_submission

app = Flask(__name__)
CORS(app, origins=CORS_ORIGINS)

# Ensure upload directories exist
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
CORPUS_FOLDER.mkdir(parents=True, exist_ok=True)

# Initialize database on startup
with app.app_context():
    init_database()

# ==================== Authentication Endpoints ====================

@app.route('/api/auth/register', methods=['POST'])
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

@app.route('/api/auth/login', methods=['POST'])
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

@app.route('/api/auth/me', methods=['GET'])
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

# ==================== Submission Endpoints ====================

@app.route('/api/submissions/upload', methods=['POST'])
@require_auth
def upload_submission():
    """Upload a file for plagiarism analysis"""
    user = get_current_user()
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Validate file
    filename = secure_filename(file.filename)
    file_ext = Path(filename).suffix.lower()
    
    if file_ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'File type {file_ext} not allowed'}), 400
    
    # Save file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_filename = f"{timestamp}_{filename}"
    file_path = UPLOAD_FOLDER / safe_filename
    file.save(str(file_path))
    
    # Validate file size
    file_size = file_path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        file_path.unlink()  # Delete file
        return jsonify({'error': 'File too large'}), 400
    
    try:
        # Extract text from file
        content_text = extract_text(str(file_path), file_ext)
        
        # Create submission record
        submission_id = Submission.create(
            user_id=user['id'],
            filename=filename,
            file_path=str(file_path),
            content_text=content_text
        )
        
        # Automatically process the submission
        process_submission_analysis(submission_id)
        
        submission = Submission.get_by_id(submission_id)
        return jsonify({
            'message': 'File uploaded successfully',
            'submission': {
                'id': submission['id'],
                'filename': submission['filename'],
                'status': submission['status'],
                'uploaded_at': submission['uploaded_at']
            }
        }), 201
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        return jsonify({'error': f'Error processing file: {str(e)}'}), 500

@app.route('/api/submissions', methods=['GET'])
@require_auth
def get_submissions():
    """Get user's submission history"""
    user = get_current_user()
    submissions = Submission.get_by_user(user['id'])
    
    return jsonify({
        'submissions': [
            {
                'id': s['id'],
                'filename': s['filename'],
                'status': s['status'],
                'uploaded_at': s['uploaded_at']
            }
            for s in submissions
        ]
    }), 200

@app.route('/api/submissions/<int:submission_id>/results', methods=['GET'])
@require_auth
def get_submission_results(submission_id):
    """Get similarity results for a submission"""
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)
    
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
    
    # Check ownership (unless admin)
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    
    results = SimilarityResult.get_by_submission(submission_id)
    
    return jsonify({
        'submission_id': submission_id,
        'filename': submission['filename'],
        'status': submission['status'],
        'results': [
            {
                'paper_id': r['paper_id'],
                'title': r['title'],
                'author': r['author'],
                'filename': r['filename'],
                'similarity_score': round(r['similarity_score'], 4)
            }
            for r in results
        ]
    }), 200

@app.route('/api/process/<int:submission_id>', methods=['POST'])
@require_auth
def trigger_processing(submission_id):
    """Manually trigger similarity analysis for a submission"""
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)
    
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
    
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    
    process_submission_analysis(submission_id)
    
    return jsonify({'message': 'Processing started'}), 200

def process_submission_analysis(submission_id):
    """Process a submission against the corpus"""
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return
    
    Submission.update_status(submission_id, 'processing')
    
    try:
        # Get all corpus papers
        corpus_papers = Paper.get_all_texts()
        
        if not corpus_papers:
            Submission.update_status(submission_id, 'completed')
            return
        
        # Process similarity
        results = process_submission(
            submission['content_text'],
            corpus_papers
        )
        
        # Save results
        result_tuples = [(r['paper_id'], r['similarity_score']) for r in results]
        SimilarityResult.create_batch(submission_id, result_tuples)
        
        Submission.update_status(submission_id, 'completed')
    except Exception as e:
        Submission.update_status(submission_id, 'pending')
        raise e

# ==================== Corpus Management Endpoints ====================

@app.route('/api/corpus/upload', methods=['POST'])
@require_auth
def upload_corpus_paper():
    """Add a paper to the corpus (admin or user)"""
    user = get_current_user()
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Get metadata
    title = request.form.get('title', '')
    author = request.form.get('author', '')
    
    # Validate file
    filename = secure_filename(file.filename)
    file_ext = Path(filename).suffix.lower()
    
    if file_ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'File type {file_ext} not allowed'}), 400
    
    # Save file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_filename = f"{timestamp}_{filename}"
    file_path = CORPUS_FOLDER / safe_filename
    file.save(str(file_path))
    
    # Validate file size
    file_size = file_path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        file_path.unlink()
        return jsonify({'error': 'File too large'}), 400
    
    try:
        # Extract text
        content_text = extract_text(str(file_path), file_ext)
        
        # Create paper record
        paper_id = Paper.create(
            title=title or filename,
            author=author or 'Unknown',
            filename=filename,
            file_path=str(file_path),
            content_text=content_text,
            uploaded_by=user['id']
        )
        
        paper = Paper.get_by_id(paper_id)
        return jsonify({
            'message': 'Paper added to corpus successfully',
            'paper': {
                'id': paper['id'],
                'title': paper['title'],
                'author': paper['author'],
                'filename': paper['filename']
            }
        }), 201
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        return jsonify({'error': f'Error processing file: {str(e)}'}), 500

@app.route('/api/corpus', methods=['GET'])
@require_auth
def get_corpus():
    """Get all papers in corpus"""
    papers = Paper.get_all()
    
    return jsonify({
        'papers': [
            {
                'id': p['id'],
                'title': p['title'],
                'author': p['author'],
                'filename': p['filename'],
                'uploaded_at': p['uploaded_at']
            }
            for p in papers
        ]
    }), 200

@app.route('/api/corpus/<int:paper_id>', methods=['DELETE'])
@require_admin
def delete_corpus_paper(paper_id):
    """Delete a paper from corpus (admin only)"""
    paper = Paper.get_by_id(paper_id)
    
    if not paper:
        return jsonify({'error': 'Paper not found'}), 404
    
    # Delete file
    file_path = Path(paper['file_path'])
    if file_path.exists():
        file_path.unlink()
    
    # Delete from database
    Paper.delete(paper_id)
    
    return jsonify({'message': 'Paper deleted successfully'}), 200

# ==================== Health Check ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)
