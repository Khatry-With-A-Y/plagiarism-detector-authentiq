from concurrent.futures import ThreadPoolExecutor
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
from ..utils.cosine import process_submission_with_cached_idf
from ..utils.corpus_cache import get_corpus_cache

papers_bp = Blueprint('papers', __name__, url_prefix='/api')

import time

# Thread pool for submission processing - limits concurrent workers to prevent resource exhaustion
_submission_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="submission_worker")

# Simple in-memory cache for admin stats to prevent database overload
_admin_cache = {
    'stats': {'data': None, 'last_updated': 0},
    'corpus_growth': {} # keyed by timeframe
}
CACHE_TTL = 10 # Lower seconds refreshes cache sooner 

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
    
    # Check for custom filename
    custom_filename = request.form.get('filename')
    final_filename = custom_filename if custom_filename else filename
    
    # Validate file size
    file_size = file_path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        file_path.unlink()  # Delete file
        return jsonify({'error': 'File too large'}), 400
    
    try:
        # Extract text from file (use fast_mode=True to match corpus ingestion method)
        content_text = extract_text(str(file_path), file_ext, fast_mode=True)
        
        # Create submission record
        submission_id = Submission.create(
            user_id=user['id'],
            filename=final_filename,
            file_path=str(file_path),
            content_text=content_text
        )
        
        # Start background processing using thread pool
        _submission_executor.submit(process_submission_analysis_safe, submission_id)
        
        submission = Submission.get_by_id(submission_id)
        return jsonify({
            'message': 'File uploaded successfully and analysis started',
            'submission': {
                'id': submission['id'],
                'filename': submission['filename'],
                'status': submission['status'],
                'uploaded_at': submission['uploaded_at'],
                'file_size': submission.get('file_size', 0)
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
            'file_size': s.get('file_size', 0),
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


@papers_bp.route('/submissions/<int:submission_id>/filename', methods=['PUT'])
@require_auth
def update_submission_filename(submission_id):
    """Update a submission's filename"""
    user = get_current_user()
    submission = Submission.get_by_id(submission_id)

    if not submission:
        return jsonify({'error': 'Submission not found'}), 404

    # Check ownership (unless admin)
    if submission['user_id'] != user['id'] and user['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    if not data or 'filename' not in data:
        return jsonify({'error': 'No filename provided'}), 400

    new_filename = data['filename'].strip()
    if not new_filename:
        return jsonify({'error': 'Filename cannot be empty'}), 400

    Submission.update_filename(submission_id, new_filename)

    return jsonify({'message': 'Filename updated successfully', 'filename': new_filename}), 200


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
    
    # Start background processing using thread pool
    _submission_executor.submit(process_submission_analysis_safe, submission_id)

    return jsonify({'message': 'Processing started'}), 200


def process_submission_analysis_safe(submission_id):
    """Wrapper for process_submission_analysis to handle errors in background thread"""
    try:
        process_submission_analysis(submission_id)
    except Exception as e:
        print(f"Error in background processing for submission {submission_id}: {str(e)}")


def process_submission_analysis(submission_id):
    """Process a submission against the corpus using cached corpus and IDF (FASTEST)"""
    submission = Submission.get_by_id(submission_id)
    if not submission:
        return

    Submission.update_status(submission_id, 'processing')

    try:
        # Get cached corpus and IDF (shared across all worker threads)
        corpus_cache = get_corpus_cache()
        corpus_preprocessed = corpus_cache.get_corpus()
        cached_idf = corpus_cache.get_idf()

        if not corpus_preprocessed:
            Submission.update_status(submission_id, 'completed')
            return

        # Process similarity using cached corpus AND cached IDF - no redundant computation!
        results = process_submission_with_cached_idf(
            submission['content_text'],
            corpus_preprocessed,
            cached_idf
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
        # Extract text (use fast_mode=True to match corpus ingestion method)
        content_text = extract_text(str(file_path), file_ext, fast_mode=True)
        
        # Create paper record
        paper_id = Paper.create(
            title=title or filename,
            author=author or 'Unknown',
            filename=filename,
            file_path=str(file_path),
            content_text=content_text,
            uploaded_by=user['id']
        )

        # Invalidate corpus cache so new paper is included in similarity checks
        get_corpus_cache().invalidate()

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

    # Invalidate corpus cache so deleted paper is excluded from similarity checks
    get_corpus_cache().invalidate()

    return jsonify({'message': 'Paper deleted successfully'}), 200


# health check
@papers_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'}), 200

# ======== admin overview ========

@papers_bp.route('/admin/stats', methods=['GET'])
@require_admin
def get_admin_stats():
    """Get system-wide statistics for the admin dashboard"""
    current_time = time.time()
    if current_time - _admin_cache['stats']['last_updated'] < CACHE_TTL and _admin_cache['stats']['data'] is not None:
        return jsonify(_admin_cache['stats']['data']), 200

    from ..utils.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()

    # Total Papers Indexed
    cursor.execute('SELECT COUNT(*) FROM papers')
    total_papers = cursor.fetchone()[0]

    # Registered Users
    cursor.execute('SELECT COUNT(*) FROM users')
    total_users = cursor.fetchone()[0]

    # System Total Reports
    cursor.execute('SELECT COUNT(*) FROM submissions')
    total_reports = cursor.fetchone()[0]

    # Submissions with completed status for average similarity & high risk
    cursor.execute("""
        SELECT 
            COALESCE(AVG(max_score), 0) as avg_score, 
            COALESCE(SUM(CASE WHEN max_score >= 0.4 THEN 1 ELSE 0 END), 0) as high_risk_count 
        FROM (
            SELECT s.id, COALESCE(MAX(r.similarity_score), 0) as max_score 
            FROM submissions s 
            LEFT JOIN similarity_results r ON s.id = r.submission_id 
            WHERE s.status = 'completed' 
            GROUP BY s.id
        )
    """)
    stats_result = cursor.fetchone()
    
    avg_score_raw = stats_result['avg_score'] if stats_result and stats_result['avg_score'] is not None else 0
    high_risk_alerts = stats_result['high_risk_count'] if stats_result and stats_result['high_risk_count'] is not None else 0
    average_similarity = round(avg_score_raw * 100, 1)

    conn.close()

    result_data = {
        'total_papers_indexed': total_papers,
        'registered_users': total_users,
        'system_total_reports': total_reports,
        'average_similarity': average_similarity,
        'high_risk_alerts': high_risk_alerts
    }
    
    # Update cache
    _admin_cache['stats']['data'] = result_data
    _admin_cache['stats']['last_updated'] = current_time

    return jsonify(result_data), 200

@papers_bp.route('/admin/corpus-growth', methods=['GET'])
@require_admin
def get_corpus_growth():
    """Get corpus growth statistics over time for charts"""
    timeframe = request.args.get('timeframe', 'week') # past_hour, 24_hours, week
    
    current_time = time.time()
    if timeframe in _admin_cache['corpus_growth']:
        cache_entry = _admin_cache['corpus_growth'][timeframe]
        if current_time - cache_entry['last_updated'] < CACHE_TTL and cache_entry['data'] is not None:
            return jsonify(cache_entry['data']), 200

    from ..utils.database import get_db_connection
    from datetime import datetime, timedelta
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.utcnow()
    
    # We will fetch all data from that timeframe, group it appropriately.
    # To keep it simple, we fetch raw times and aggregate in Python
    
    if timeframe == 'past_hour':
        start_time = now - timedelta(hours=1)
        # Format: 5 minute intervals (12 points)
        num_points = 12
        interval_mins = 5
        date_format = "%H:%M"
    elif timeframe == '24_hours':
        start_time = now - timedelta(hours=24)
        # Format: 2 hour intervals (12 points)
        num_points = 12
        interval_mins = 120
        date_format = "%H:%M"
    else: # week
        start_time = now - timedelta(days=7)
        # Format: daily (7 points)
        num_points = 7
        interval_mins = 24 * 60
        date_format = "%a" # Mon, Tue, etc.

    cursor.execute(
        "SELECT uploaded_at FROM papers WHERE uploaded_at >= ?", 
        (start_time.strftime('%Y-%m-%d %H:%M:%S'),)
    )
    rows = cursor.fetchall()
    
    # Base count before start_time
    cursor.execute(
        "SELECT COUNT(*) FROM papers WHERE uploaded_at < ?", 
        (start_time.strftime('%Y-%m-%d %H:%M:%S'),)
    )
    base_count = cursor.fetchone()[0]
    conn.close()
    
    # Aggregate data points
    labels = []
    values = []
    
    current_count = base_count
    
    for i in range(num_points):
        interval_start = start_time + timedelta(minutes=i * interval_mins)
        interval_end = start_time + timedelta(minutes=(i + 1) * interval_mins)
        
        # Count papers in this interval
        interval_added = sum(1 for row in rows if interval_start <= datetime.strptime(row['uploaded_at'], '%Y-%m-%d %H:%M:%S') < interval_end)
        current_count += interval_added
        
        labels.append(interval_end.strftime(date_format))
        values.append(current_count)
        
    result_data = {
        'labels': labels,
        'values': values,
        'added_count': len(rows),
        'timeframe': timeframe
    }
    
    # Update cache
    _admin_cache['corpus_growth'][timeframe] = {
        'data': result_data,
        'last_updated': current_time
    }
        
    return jsonify(result_data), 200


@papers_bp.route('/admin/processing-time', methods=['GET'])
@require_admin
def get_processing_time():
    """Get overall average processing time and recent latency trend data"""
    current_time = time.time()
    
    if 'processing_time' in _admin_cache:
        cache_entry = _admin_cache['processing_time']
        if current_time - cache_entry['last_updated'] < CACHE_TTL and cache_entry['data'] is not None:
            return jsonify(cache_entry['data']), 200

    from ..utils.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 
            CAST(strftime('%s', MAX(r.created_at)) AS INTEGER) - CAST(strftime('%s', s.uploaded_at) AS INTEGER) as processing_time
        FROM submissions s
        JOIN similarity_results r ON s.id = r.submission_id
        WHERE s.status = 'completed'
        GROUP BY s.id
        ORDER BY s.uploaded_at ASC
    ''')
    rows = cursor.fetchall()
    conn.close()
    
    times = [row['processing_time'] for row in rows if row['processing_time'] is not None and row['processing_time'] >= 0]
    
    if times:
        avg_time = sum(times) / len(times)
        sorted_times = sorted(times)
        p95_index = int(len(sorted_times) * 0.95)
        if p95_index >= len(sorted_times):
            p95_index = len(sorted_times) - 1
        p95_time = sorted_times[p95_index]
        # Get the last 20 processing times for the trend graph
        trend = times[-20:]
    else:
        avg_time = 0
        p95_time = 0
        trend = []
        
    result_data = {
        'average_time': round(avg_time, 1),
        'p95_time': round(p95_time, 1),
        'trend': trend
    }
    
    _admin_cache['processing_time'] = {
        'data': result_data,
        'last_updated': current_time
    }
    
    return jsonify(result_data), 200