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


class Paper:
    @staticmethod
    def create(title, author, filename, file_path, content_text, uploaded_by):
        """Add a paper to the corpus"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO papers (title, author, filename, file_path, content_text, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (title, author, filename, file_path, content_text, uploaded_by))
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
        """Get all paper texts for similarity calculation"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, content_text FROM papers WHERE content_text IS NOT NULL')
        papers = [(row['id'], row['content_text']) for row in cursor.fetchall()]
        conn.close()
        return papers
    
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
    def create(user_id, filename, file_path, content_text):
        """Create a new submission"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO submissions (user_id, filename, file_path, content_text, status)
            VALUES (?, ?, ?, ?, 'pending')
        ''', (user_id, filename, file_path, content_text))
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
        return dict(submission) if submission else None
    
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
    def get_by_submission(submission_id):
        """Get all similarity results for a submission, ordered by score"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT sr.*, p.title, p.author, p.filename
            FROM similarity_results sr
            JOIN papers p ON sr.paper_id = p.id
            WHERE sr.submission_id = ?
            ORDER BY sr.similarity_score DESC
        ''', (submission_id,))
        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results