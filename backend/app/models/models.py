import json
import sqlite3
from datetime import datetime
from ..utils.database import get_db_connection


class User:
    @staticmethod
    def create(username, email, password_hash, role='user'):
        """Create a new user"""
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
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None
    
    @staticmethod
    def get_by_id(user_id):
        """Get user by ID"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None
    
    @staticmethod
    def get_by_email(email):
        """Get user by email"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None

    @staticmethod
    def get_all():
        """Get all users"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, email, role, status, created_at FROM users ORDER BY created_at DESC')
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
        cursor.execute('SELECT * FROM papers ORDER BY uploaded_at DESC')
        papers = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return papers
    
    @staticmethod
    def get_paginated(page=1, limit=10):
        """Get paginated papers in corpus"""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        offset = (page - 1) * limit
        
        # Get paginated papers
        cursor.execute('''
            SELECT * FROM papers 
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
        cursor.execute('SELECT * FROM papers WHERE id = ?', (paper_id,))
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
    def create(user_id, filename, file_path, content_text, main_content=None, reference_section=None, has_references=False):
        """Create a new submission with reference exclusion support"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO submissions (user_id, filename, file_path, content_text, 
                                   main_content, reference_section, has_references, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        ''', (user_id, filename, file_path, content_text, main_content, reference_section, has_references))
        conn.commit()
        submission_id = cursor.lastrowid
        conn.close()
        return submission_id
    
    @staticmethod
    def get_by_id(submission_id):
        """Get submission by ID"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM submissions WHERE id = ?', (submission_id,))
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
            SELECT * FROM submissions 
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
            SELECT sr.*, p.title, p.author, p.filename
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