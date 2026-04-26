import json
import sqlite3
from datetime import datetime, timezone
from ..utils.database import get_db_connection


class User:
    @staticmethod
    def create(username, email, password_hash, role='user'):
        """Create a new user"""
        username = username.strip() if username else username
        email = email.strip() if email else email
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO users (username, email, password_hash, role)
                VALUES (?, ?, ?, ?)
            ''', (username, email, password_hash, role))
            conn.commit()
            user_id = cursor.lastrowid
            return user_id
        except sqlite3.IntegrityError as e:
            raise ValueError(f"User already exists: {str(e)}")
        finally:
            conn.close()
    
    @staticmethod
    def get_by_username(username):
        """Get user by username"""
        username = username.strip() if username else username
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None
    
    @staticmethod
    def get_by_id(user_id):
        """Get user by ID"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None
    
    @staticmethod
    def get_by_email(email):
        """Get user by email"""
        email = email.strip() if email else email
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None

    @staticmethod
    def get_all():
        """Get all users"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, username, email, role, status, 
                   strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at 
            FROM users ORDER BY created_at DESC
        ''')
        users = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return users


class Paper:
    @staticmethod
    def create(title, author, filename, file_path, content_text, uploaded_by):
        """Add a paper to the corpus with preprocessed n-grams and reference exclusion"""
        from ..utils.text_processing import TextProcessor
        from ..utils.reference_detector import ReferenceDetector

        # Split references from main content (OPTIMIZATION: at ingestion time)
        main_content, reference_section = ReferenceDetector.split_content_and_references(content_text)
        has_references = bool(reference_section)

        # Compute n-grams on main_content only (excludes references)
        preprocessed_ngrams = None
        if main_content:
            ngrams = TextProcessor.preprocess_for_tfidf(main_content)
            preprocessed_ngrams = json.dumps(ngrams)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO papers (title, author, filename, file_path, content_text, 
                              main_content, reference_section, has_references, preprocessed_ngrams, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (title, author, filename, file_path, content_text, 
              main_content, reference_section, has_references, preprocessed_ngrams, uploaded_by))
        conn.commit()
        paper_id = cursor.lastrowid
        conn.close()
        return paper_id
    
    @staticmethod
    def get_all():
        """Get all papers in corpus"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', uploaded_at) as uploaded_at 
            FROM papers ORDER BY uploaded_at DESC
        ''')
        papers = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return papers
    
    @staticmethod
    def get_paginated(page=1, limit=10, search_query=None):
        """Get paginated papers in corpus"""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        offset = (page - 1) * limit # Pagination Formula
        
        if search_query:
            query_str = f"%{search_query}%"
            if search_query.isdigit():
                base_query = '''
                    FROM papers 
                    WHERE id = ? OR title LIKE ? OR author LIKE ? OR filename LIKE ?
                '''
                params = (int(search_query), query_str, query_str, query_str)
            else:
                base_query = '''
                    FROM papers 
                    WHERE title LIKE ? OR author LIKE ? OR filename LIKE ?
                '''
                params = (query_str, query_str, query_str)
                
            # Get paginated papers
            cursor.execute(f'''
                SELECT * {base_query}
                ORDER BY id ASC
                LIMIT ? OFFSET ?
            ''', params + (limit, offset))
            papers = [dict(row) for row in cursor.fetchall()]
            
            # Get total count
            cursor.execute(f'SELECT COUNT(*) as total {base_query}', params)
            total = cursor.fetchone()['total']
        else:
            # Get paginated papers
            cursor.execute('''
                SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', uploaded_at) as uploaded_at 
                FROM papers 
                ORDER BY id ASC
                LIMIT ? OFFSET ?
            ''', (limit, offset))
            papers = [dict(row) for row in cursor.fetchall()]
            
            # Get total count
            cursor.execute('SELECT COUNT(*) as total FROM papers')
            total = cursor.fetchone()['total']
            
        conn.close()
        return papers, total
    
    @staticmethod
    def get_by_id(paper_id):
        """Get paper by ID"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', uploaded_at) as uploaded_at FROM papers WHERE id = ?", (paper_id,))
        paper = cursor.fetchone()
        conn.close()
        return dict(paper) if paper else None
    
    @staticmethod
    def get_all_texts():
        """Get all paper texts for similarity calculation (legacy method)"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, content_text FROM papers WHERE content_text IS NOT NULL')
        papers = [(row['id'], row['content_text']) for row in cursor.fetchall()]
        conn.close()
        return papers

    @staticmethod
    def get_all_preprocessed():
        """
        Get all paper preprocessed n-grams for fast similarity calculation.
        Returns list of tuples: (paper_id, ngrams_list)
        Falls back to computing n-grams for papers without cached data.
        """
        from ..utils.text_processing import TextProcessor

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, content_text, preprocessed_ngrams FROM papers WHERE content_text IS NOT NULL')

        results = []
        papers_needing_update = []

        for row in cursor.fetchall():
            paper_id = row['id']

            if row['preprocessed_ngrams']:
                # Use cached n-grams
                ngrams = json.loads(row['preprocessed_ngrams'])
            else:
                # Fallback: compute on-the-fly (for papers ingested before migration)
                ngrams = TextProcessor.preprocess_for_tfidf(row['content_text'])
                papers_needing_update.append((paper_id, json.dumps(ngrams)))

            if ngrams:  # Only include papers with valid n-grams
                results.append((paper_id, ngrams))

        conn.close()

        # Lazy update: cache computed n-grams for future use
        if papers_needing_update:
            Paper._batch_update_preprocessed(papers_needing_update)

        return results

    @staticmethod
    def _batch_update_preprocessed(updates):
        """Batch update preprocessed_ngrams for papers"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.executemany(
            'UPDATE papers SET preprocessed_ngrams = ? WHERE id = ?',
            [(ngrams, paper_id) for paper_id, ngrams in updates]
        )
        conn.commit()
        conn.close()
    
    @staticmethod
    def delete(paper_id):
        """Delete a paper from corpus"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM papers WHERE id = ?', (paper_id,))
        conn.commit()
        deleted = cursor.rowcount > 0
        conn.close()
        return deleted


class Submission:
    @staticmethod
    def create(user_id, filename, file_path, content_text, main_content=None, reference_section=None, has_references=False, domain_tag='CS'):
        """Create a new submission with reference exclusion support"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO submissions (user_id, filename, file_path, content_text, 
                                   main_content, reference_section, has_references, status, domain_tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        ''', (user_id, filename, file_path, content_text, main_content, reference_section, has_references, domain_tag))
        conn.commit()
        submission_id = cursor.lastrowid
        conn.close()
        return submission_id
    
    @staticmethod
    def get_by_id(submission_id):
        """Get submission by ID"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT *, 
                   strftime('%Y-%m-%dT%H:%M:%SZ', uploaded_at) as uploaded_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', review_requested_at) as review_requested_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', admin_decided_at) as admin_decided_at
            FROM submissions WHERE id = ?
        ''', (submission_id,))
        submission = cursor.fetchone()
        conn.close()
        
        if submission:
            sub_dict = dict(submission)
            try:
                import os
                sub_dict['file_size'] = os.path.getsize(sub_dict['file_path'])
            except OSError:
                sub_dict['file_size'] = 0
            return sub_dict
        return None
    
    @staticmethod
    def get_by_user(user_id):
        """Get all submissions for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT *, 
                   strftime('%Y-%m-%dT%H:%M:%SZ', uploaded_at) as uploaded_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', review_requested_at) as review_requested_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', admin_decided_at) as admin_decided_at
            FROM submissions 
            WHERE user_id = ? 
            ORDER BY uploaded_at DESC
        ''', (user_id,))
        submissions = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        import os
        for sub in submissions:
            try:
                sub['file_size'] = os.path.getsize(sub['file_path'])
            except OSError:
                sub['file_size'] = 0
                
        return submissions
    
    @staticmethod
    def update_status(submission_id, status):
        """Update submission status"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE submissions SET status = ? WHERE id = ?
        ''', (status, submission_id))
        conn.commit()
        conn.close()

    @staticmethod
    def update_filename(submission_id, filename):
        """Update submission filename"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE submissions SET filename = ? WHERE id = ?
        ''', (filename, submission_id))
        conn.commit()
        conn.close()

    @staticmethod
    def get_eligibility(submission_id):
        """
        Check if a submission is eligible for peer review.
        eligible = max(doc_score) < T AND max(sentence_score) < T
        """
        from ...config import REVIEW_ELIGIBILITY_UPPER
        
        # We need results to check doc_score
        results = SimilarityResult.get_by_submission(submission_id)
        
        # If no matches found, we treat it as 0% similarity (eligible)
        max_doc_score = max((r['similarity_score'] for r in results), default=0) if results else 0
        
        # Calculate highest exact match (sentence-level)
        highest_exact_match = 0
        if results:
            for r in results:
                match_details_str = r.get('match_details')
                if match_details_str:
                    try:
                        md = json.loads(match_details_str)
                        score = md.get('highest_match_score', 0)
                        if score > highest_exact_match:
                            highest_exact_match = score
                    except: pass
        
        is_eligible = max_doc_score < REVIEW_ELIGIBILITY_UPPER and highest_exact_match < REVIEW_ELIGIBILITY_UPPER
        
        return {
            'eligible': is_eligible,
            'max_doc_score': max_doc_score,
            'max_sentence_score': highest_exact_match,
            'threshold': REVIEW_ELIGIBILITY_UPPER
        }

    @staticmethod
    def request_review(submission_id, user_id, domain_tag='CS'):
        """Transition a submission to 'pending' review status"""
        eligibility = Submission.get_eligibility(submission_id)
        if not eligibility['eligible']:
            raise ValueError("Submission is not eligible for peer review (similarity too high)")

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            # Enforce idx_one_active_request logic: only one active review request per submission
            # In the v2 schema, this is naturally handled as columns on the submission row.
            # We check if review_status is already set.
            cursor.execute('SELECT review_status FROM submissions WHERE id = ?', (submission_id,))
            row = cursor.fetchone()
            if not row:
                raise ValueError("Submission not found")
            
            if row['review_status'] and row['review_status'] not in ('approved', 'rejected'):
                raise ValueError("An active review request already exists for this submission")

            cursor.execute('''
                UPDATE submissions 
                SET review_status = 'pending',
                    review_requested_at = CURRENT_TIMESTAMP,
                    review_requested_by = ?,
                    domain_tag = ?,
                    review_votes = '[]',
                    pass_votes = 0,
                    fail_votes = 0,
                    review_outcome = NULL,
                    admin_decision = NULL,
                    admin_decided_by = NULL,
                    admin_decided_at = NULL,
                    admin_decision_reason = NULL
                WHERE id = ?
            ''', (user_id, domain_tag, submission_id))
            conn.commit()
            return True
        finally:
            conn.close()

    @staticmethod
    def get_admin_review_queue(status=None, page=1, limit=50):
        """List submissions in the peer review queue for admin"""
        conn = get_db_connection()
        cursor = conn.cursor()
        offset = (page - 1) * limit
        
        query = '''
            SELECT s.*, u.username as submitter_name,
                   strftime('%Y-%m-%dT%H:%M:%SZ', s.uploaded_at) as uploaded_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', s.review_requested_at) as review_requested_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', s.admin_decided_at) as admin_decided_at
            FROM submissions s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.review_status IS NOT NULL
        '''
        params = []
        if status:
            query += ' AND s.review_status = ?'
            params.append(status)
        
        query += ' ORDER BY s.review_requested_at DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        requests = [dict(row) for row in cursor.fetchall()]
        
        # Get total count
        count_query = 'SELECT COUNT(*) as total FROM submissions WHERE review_status IS NOT NULL'
        if status:
            count_query += ' AND review_status = ?'
            cursor.execute(count_query, (status,))
        else:
            cursor.execute(count_query)
            
        total = cursor.fetchone()['total']
        conn.close()
        
        return {
            'requests': requests,
            'total': total,
            'page': page,
            'limit': limit,
            'pages': (total + limit - 1) // limit
        }

    @staticmethod
    def delete(submission_id):
        """Delete a submission and its results"""
        conn = get_db_connection()
        cursor = conn.cursor()
        # Delete similarity results first
        cursor.execute('DELETE FROM similarity_results WHERE submission_id = ?', (submission_id,))
        # Delete submission
        cursor.execute('DELETE FROM submissions WHERE id = ?', (submission_id,))
        conn.commit()
        deleted = cursor.rowcount > 0
        conn.close()
        return deleted


class SimilarityResult:
    @staticmethod
    def create_batch(submission_id, results):
        """Create multiple similarity results at once
        results: list of tuples (paper_id, similarity_score)
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.executemany('''
            INSERT OR REPLACE INTO similarity_results (submission_id, paper_id, similarity_score)
            VALUES (?, ?, ?)
        ''', [(submission_id, paper_id, score) for paper_id, score in results])
        conn.commit()
        conn.close()

    @staticmethod
    def update_match_details(submission_id, paper_id, match_details_json):
        """Update match_details for a specific similarity result"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE similarity_results
            SET match_details = ?
            WHERE submission_id = ? AND paper_id = ?
        ''', (match_details_json, submission_id, paper_id))
        conn.commit()
        conn.close()

    @staticmethod
    def get_by_submission(submission_id):
        """Get all similarity results with valid match_details for a submission, ordered by score"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT sr.*, p.title, p.author, p.filename,
                   strftime('%Y-%m-%dT%H:%M:%SZ', sr.created_at) as created_at
            FROM similarity_results sr
            JOIN papers p ON sr.paper_id = p.id
            WHERE sr.submission_id = ?
              AND sr.match_details IS NOT NULL
              AND sr.match_details != ''
              AND json_extract(sr.match_details, '$.matches') IS NOT NULL
              AND json_array_length(json_extract(sr.match_details, '$.matches')) > 0
            ORDER BY sr.similarity_score DESC
        ''', (submission_id,))
        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

class Reviewer:
    @staticmethod
    def apply(user_id, institution_domain, institution_name, affiliation, institutional_email, bio, expertise_tags=["CS"]):
        """Create or update a reviewer application"""
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            expertise_tags_json = json.dumps(expertise_tags)
            cursor.execute('''
                INSERT INTO reviewers (user_id, institution_domain, institution_name, affiliation, 
                                     institutional_email, bio, expertise_tags, application_status, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    institution_domain=excluded.institution_domain,
                    institution_name=excluded.institution_name,
                    affiliation=excluded.affiliation,
                    institutional_email=excluded.institutional_email,
                    bio=excluded.bio,
                    expertise_tags=excluded.expertise_tags,
                    application_status='pending',
                    submitted_at=CURRENT_TIMESTAMP,
                    decision_reason=NULL,
                    reviewed_at=NULL,
                    reviewed_by=NULL,
                    revoked_at=NULL,
                    revoked_by=NULL,
                    revoke_reason=NULL
            ''', (user_id, institution_domain, institution_name, affiliation, institutional_email, bio, expertise_tags_json))
            conn.commit()
            return True
        except sqlite3.IntegrityError as e:
            if "UNIQUE constraint failed: reviewers.institutional_email" in str(e):
                raise ValueError("Institutional email already in use by another applicant.")
            raise ValueError(f"Application failed: {str(e)}")
        finally:
            conn.close()

    @staticmethod
    def get_by_user_id(user_id):
        """Get reviewer record by user ID"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT *,
                   strftime('%Y-%m-%dT%H:%M:%SZ', submitted_at) as submitted_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', reviewed_at) as reviewed_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', verified_at) as verified_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', revoked_at) as revoked_at
            FROM reviewers WHERE user_id = ?
        ''', (user_id,))
        reviewer = cursor.fetchone()
        conn.close()
        if reviewer:
            r_dict = dict(reviewer)
            if r_dict['expertise_tags']:
                r_dict['expertise_tags'] = json.loads(r_dict['expertise_tags'])
            return r_dict
        return None

    @staticmethod
    def list_applications(status=None, page=1, limit=50):
        """List reviewer applications for admin"""
        conn = get_db_connection()
        cursor = conn.cursor()
        offset = (page - 1) * limit
        
        query = '''
            SELECT r.*, u.username, u.email,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.submitted_at) as submitted_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.reviewed_at) as reviewed_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.verified_at) as verified_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.revoked_at) as revoked_at
            FROM reviewers r 
            JOIN users u ON r.user_id = u.id
        '''
        params = []
        if status:
            query += ' WHERE r.application_status = ?'
            params.append(status)
        
        query += ' ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        apps = [dict(row) for row in cursor.fetchall()]
        
        for a in apps:
            if a['expertise_tags']:
                a['expertise_tags'] = json.loads(a['expertise_tags'])
        
        # Get total count
        count_query = 'SELECT COUNT(*) as total FROM reviewers'
        if status:
            count_query += ' WHERE application_status = ?'
            cursor.execute(count_query, [status])
        else:
            cursor.execute(count_query)
        total = cursor.fetchone()['total']
        
        conn.close()
        return apps, total

    @staticmethod
    def decide(user_id, admin_id, decision, reason=None):
        """Admin decision on reviewer application"""
        if decision not in ['approved', 'rejected']:
            raise ValueError("Invalid decision")
            
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            
            now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE reviewers SET 
                    application_status = ?,
                    decision_reason = ?,
                    reviewed_at = ?,
                    reviewed_by = ?,
                    verified_at = ?
                WHERE user_id = ?
            ''', (decision, reason, now, admin_id, (now if decision == 'approved' else None), user_id))
            
            if decision == 'approved':
                cursor.execute('UPDATE users SET role = "reviewer" WHERE id = ?', (user_id,))
            
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    @staticmethod
    def revoke(user_id, admin_id, reason=None):
        """Revoke reviewer status"""
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE reviewers SET 
                    revoked_at = ?,
                    revoked_by = ?,
                    revoke_reason = ?,
                    application_status = 'rejected'
                WHERE user_id = ?
            ''', (now, admin_id, reason, user_id))
            
            cursor.execute('UPDATE users SET role = "user" WHERE id = ?', (user_id,))
            
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

class Institution:
    @staticmethod
    def get_allowed():
        """Get list of allowed institutions from config"""
        from ...config import ALLOWED_INSTITUTION_DOMAINS
        return ALLOWED_INSTITUTION_DOMAINS

class Notification:
    @staticmethod
    def create(user_id, title, message, type='info'):
        """Create a new notification"""
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (?, ?, ?, ?)
            ''', (user_id, title, message, type))
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    @staticmethod
    def get_by_user(user_id, limit=20):
        """Get notifications for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, user_id, type, title, message, is_read, 
                   strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at
            FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        ''', (user_id, limit))
        notifications = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return notifications

    @staticmethod
    def get_by_user_for_admin(user_id, type_filter=None):
        """Get notifications for a specific user (admin use only)"""
        conn = get_db_connection()
        cursor = conn.cursor()
        if type_filter:
            cursor.execute('''
                SELECT id, user_id, type, title, message, is_read,
                       strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at
                FROM notifications
                WHERE user_id = ? AND type = ?
                ORDER BY created_at DESC
            ''', (user_id, type_filter))
        else:
            cursor.execute('''
                SELECT id, user_id, type, title, message, is_read,
                       strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at
                FROM notifications
                WHERE user_id = ?
                ORDER BY created_at DESC
            ''', (user_id,))
        notifications = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return notifications

    @staticmethod
    def get_unread_count(user_id):
        """Get count of unread notifications for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', (user_id,))
        count = cursor.fetchone()['count']
        conn.close()
        return count

    @staticmethod
    def mark_as_read(notification_id, user_id):
        """Mark a notification as read"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', (notification_id, user_id))
        conn.commit()
        conn.close()

    @staticmethod
    def mark_all_as_read(user_id):
        """Mark all notifications as read for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()

    @staticmethod
    def delete(notification_id, user_id):
        """Delete a notification"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', (notification_id, user_id))
        conn.commit()
        conn.close()