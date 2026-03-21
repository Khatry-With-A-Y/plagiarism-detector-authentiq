import threading
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from pathlib import Path
from datetime import datetime

from ...config import (
    UPLOAD_FOLDER, CORPUS_FOLDER, MAX_FILE_SIZE, ALLOWED_EXTENSIONS
)
from ..models.models import User, Paper, Submission, SimilarityResult
from ..utils.auth import get_current_user, require_auth, require_admin
from ..utils.file_processor import extract_text, validate_file
from ..utils.cosine import process_submission as compute_similarity

papers_bp = Blueprint('papers', __name__, url_prefix='/api')

# ========== submission endpoints ===========

@papers_bp.route('/submissions/upload', methods=['POST'])
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
        
        # Start background processing
        thread = threading.Thread(target=process_submission_analysis_safe, args=(submission_id,))
        thread.daemon = True
        thread.start()
        
        submission = Submission.get_by_id(submission_id)
        return jsonify({
            'message': 'File uploaded successfully and analysis started',
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


@papers_bp.route('/submissions', methods=['GET'])
@require_auth
def get_submissions():
    """Get user's submission history"""
    user = get_current_user()
    submissions = Submission.get_by_user(user['id'])

    result = []
    for s in submissions:
        # Get max similarity score for this submission
        results = SimilarityResult.get_by_submission(s['id'])
        max_similarity = max((r['similarity_score'] for r in results), default=0) if results else 0

        result.append({
            'id': s['id'],
            'filename': s['filename'],
            'status': s['status'],
            'uploaded_at': s['uploaded_at'],
            'similarity_score': round(max_similarity * 100, 2)  # Convert to percentage
        })

    return jsonify({'submissions': result}), 200


@papers_bp.route('/submissions/<int:submission_id>', methods=['DELETE'])
@require_auth
def delete_submission(submission_id):
    """Delete a submission"""
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)

    if not submission:
        return jsonify({'error': 'Submission not found'}), 404

    # Check ownership (unless admin)
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403

    # Delete file if exists
    file_path = Path(submission['file_path'])
    if file_path.exists():
        file_path.unlink()

    # Delete from database (results will be deleted via cascade in model)
    Submission.delete(submission_id)

    return jsonify({'message': 'Submission deleted successfully'}), 200


@papers_bp.route('/submissions/<int:submission_id>/results', methods=['GET'])
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


@papers_bp.route('/process/<int:submission_id>', methods=['POST'])
@require_auth
def trigger_processing(submission_id):
    """Manually trigger similarity analysis for a submission"""
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)
    
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
    
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    
    # Start background processing
    thread = threading.Thread(target=process_submission_analysis_safe, args=(submission_id,))
    thread.daemon = True
    thread.start()
    
    return jsonify({'message': 'Processing started'}), 200


def process_submission_analysis_safe(submission_id):
    """Wrapper for process_submission_analysis to handle errors in background thread"""
    try:
        process_submission_analysis(submission_id)
    except Exception as e:
        print(f"Error in background processing for submission {submission_id}: {str(e)}")


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
        results = compute_similarity(
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


# ======== corpus management ========

@papers_bp.route('/corpus/upload', methods=['POST'])
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


@papers_bp.route('/corpus', methods=['GET'])
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


@papers_bp.route('/corpus/<int:paper_id>', methods=['DELETE'])
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


# health check
@papers_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'}), 200