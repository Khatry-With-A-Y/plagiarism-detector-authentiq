import json
import sqlite3
import time
from collections import Counter
from datetime import datetime, timezone, timedelta
from threading import Lock
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
        cursor.execute(
            "SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at "
            "FROM users WHERE LOWER(email) = LOWER(?)",
            (email,),
        )
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


    @staticmethod
    def update_avatar(user_id, avatar_url):
        """Set the avatar_url for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (avatar_url, user_id))
        conn.commit()
        conn.close()

    @staticmethod
    def remove_avatar(user_id):
        """Clear the avatar_url for a user (revert to initials)"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET avatar_url = NULL WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()

    @staticmethod
    def update_password(user_id, new_hash):
        """Replace the stored password hash for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
        conn.commit()
        conn.close()

    @staticmethod
    def update_bio(user_id, bio):
        """Update the bio/about text for a user"""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET bio = ? WHERE id = ?", (bio, user_id))
        conn.commit()
        conn.close()


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
    def mark_processing_started(submission_id):
        """Record when similarity analysis actually starts."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE submissions
            SET status = 'processing',
                processing_started_at = CURRENT_TIMESTAMP,
                processing_completed_at = NULL,
                processing_failed_at = NULL,
                processing_error = NULL
            WHERE id = ?
        ''', (submission_id,))
        conn.commit()
        conn.close()

    @staticmethod
    def mark_processing_completed(submission_id):
        """Record when similarity analysis finishes."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE submissions
            SET status = 'completed',
                processing_completed_at = CURRENT_TIMESTAMP,
                processing_failed_at = NULL,
                processing_error = NULL
            WHERE id = ?
        ''', (submission_id,))
        conn.commit()
        conn.close()

    @staticmethod
    def mark_processing_failed(submission_id, error_message):
        """Record when similarity analysis fails without changing CHECKed statuses."""
        message = (str(error_message).strip() if error_message is not None else '')
        if len(message) > 500:
            message = message[:500]

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE submissions
            SET status = 'pending',
                processing_failed_at = CURRENT_TIMESTAMP,
                processing_error = ?,
                processing_completed_at = NULL
            WHERE id = ?
        ''', (message, submission_id))
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
    def assign_many(submission_id, count=None):
        """
        Assign `count` eligible reviewers to a submission's peer-review request.
        Operates on submissions.review_votes JSON (v2 schema).

        Algorithm (per plan §Domain Tagging & Expertise Matching):
          1. Read submission: domain_tag, user_id, review_votes.
          2. Build candidate pool: approved reviewers with matching expertise_tag,
             excluding submitter, submitter's institution (unless STRICT_INSTITUTION_EXCLUSION=False),
             admins, and anyone already in review_votes.
          3. Order by active_assignments ASC, last assigned ASC, then RANDOM()
             (or seeded hash when ASSIGNMENT_TEST_SEED is set).
          4. Take top `count` rows; if fewer than MIN_REVIEWERS_PER_REQUEST available,
             flip review_status to 'insufficient_pool'.
          5. Append new assignment entries to review_votes JSON; set review_status='assigned'.
        """
        from ...config import (REVIEWERS_PER_REQUEST, MIN_REVIEWERS_PER_REQUEST,
                               STRICT_INSTITUTION_EXCLUSION, REVIEW_DEADLINE_HOURS,
                               ASSIGNMENT_TEST_SEED)
        import random
        from datetime import datetime, timezone, timedelta

        if count is None:
            count = REVIEWERS_PER_REQUEST

        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()

            # 1. Read submission
            cursor.execute('''
                SELECT s.id, s.user_id, s.domain_tag, s.review_votes, s.review_status,
                       r.institution_domain as submitter_institution
                FROM submissions s
                LEFT JOIN reviewers r ON r.user_id = s.user_id
                WHERE s.id = ?
            ''', (submission_id,))
            sub = cursor.fetchone()
            if not sub:
                raise ValueError('Submission not found')

            sub = dict(sub)
            existing_votes = json.loads(sub['review_votes'] or '[]')
            already_assigned_ids = {e['reviewer_id'] for e in existing_votes}
            submitter_id = sub['user_id']
            submitter_institution = sub.get('submitter_institution') or ''
            domain_tag = sub.get('domain_tag', 'CS')

            # 2. Build candidate pool
            # Get all approved reviewers with matching expertise tag
            cursor.execute('''
                SELECT r.user_id, r.institution_domain, r.institution_name, r.expertise_tags,
                       u.role, u.username,
                       (SELECT COUNT(*) FROM submissions s2
                        WHERE s2.review_status IN ('assigned','under_review')
                          AND json_extract(s2.review_votes, '$') IS NOT NULL
                          AND EXISTS (
                              SELECT 1 FROM json_each(s2.review_votes) je
                              WHERE json_extract(je.value, '$.reviewer_id') = r.user_id
                                AND json_extract(je.value, '$.assignment_status') IN ('assigned','accepted')
                          )
                       ) as active_assignments,
                       r.verified_at as last_assigned_at
                FROM reviewers r
                JOIN users u ON u.id = r.user_id
                WHERE r.application_status = 'approved'
                  AND r.revoked_at IS NULL
                  AND u.role = 'reviewer'
                  AND u.status NOT IN ('blocked', 'paused')
            ''')
            all_reviewers = [dict(row) for row in cursor.fetchall()]

            candidates = []
            conflict_ids = set()

            # Exclusion-counter breakdown for the `insufficient_pool`
            # diagnostic. Counts are mutually exclusive in evaluation order
            # (submitter > already_assigned > expertise > institution) so
            # the totals always sum to <total_active_reviewers>.
            total_active_reviewers      = len(all_reviewers)
            excluded_submitter          = 0
            excluded_already_assigned   = 0
            excluded_expertise_mismatch = 0
            excluded_same_institution   = 0

            for rev in all_reviewers:
                uid = rev['user_id']
                # Exclude submitter
                if uid == submitter_id:
                    excluded_submitter += 1
                    continue
                # Exclude already assigned (including previously declined)
                if uid in already_assigned_ids:
                    excluded_already_assigned += 1
                    continue
                # Expertise tag match (P0: all are 'CS', so this is a no-op filter)
                tags = json.loads(rev['expertise_tags'] or '["CS"]')
                if domain_tag not in tags:
                    excluded_expertise_mismatch += 1
                    continue
                # Institution exclusion
                same_inst = (rev['institution_domain'] and
                             rev['institution_domain'].lower() == submitter_institution.lower())
                if same_inst:
                    if STRICT_INSTITUTION_EXCLUSION:
                        excluded_same_institution += 1
                        continue
                    else:
                        conflict_ids.add(uid)
                candidates.append(rev)

            # 3. Order: active_assignments ASC, last_assigned_at ASC NULLS FIRST, then random
            if ASSIGNMENT_TEST_SEED:
                seed_val = int(ASSIGNMENT_TEST_SEED)
                rng = random.Random(seed_val)
                candidates.sort(key=lambda r: (
                    r['active_assignments'],
                    r['last_assigned_at'] or '',
                    rng.random()
                ))
            else:
                random.shuffle(candidates)
                candidates.sort(key=lambda r: (
                    r['active_assignments'],
                    r['last_assigned_at'] or ''
                ))

            selected = candidates[:count]

            # 4. Minimum-pool check
            # Count active assignments that already exist on this submission
            # (assigned/accepted/voted — exclude declined/expired). When we are
            # backfilling (count < REVIEWERS_PER_REQUEST), a single new pick
            # may be enough if the total active pool >= MIN_REVIEWERS_PER_REQUEST.
            # Below this floor we cannot open / sustain a panel, so the
            # submission is flipped to 'insufficient_pool'.
            existing_active = sum(
                1 for e in existing_votes
                if e.get('assignment_status') in ('assigned', 'accepted', 'voted')
            )
            total_active_after = existing_active + len(selected)

            if total_active_after < MIN_REVIEWERS_PER_REQUEST:
                # Structured breakdown so the admin queue can explain why
                # the pool was short.
                breakdown = {
                    'eligible_count':              len(candidates),
                    'excluded_submitter':          excluded_submitter,
                    'excluded_same_institution':   excluded_same_institution,
                    'excluded_already_assigned':   excluded_already_assigned,
                    'excluded_expertise_mismatch': excluded_expertise_mismatch,
                    'total_active_reviewers':      total_active_reviewers,
                    'min_required':                MIN_REVIEWERS_PER_REQUEST,
                    'existing_active':             existing_active,
                }
                cursor.execute(
                    "UPDATE submissions "
                    "SET review_status='insufficient_pool', pool_breakdown=? "
                    "WHERE id=?",
                    (json.dumps(breakdown), submission_id)
                )
                conn.commit()
                return {
                    'status':       'insufficient_pool',
                    'assigned':     len(selected),
                    'active_total': total_active_after,
                    'breakdown':    breakdown,
                }

            # 5. Build new assignment entries and append to review_votes
            now_utc = datetime.now(timezone.utc)
            deadline_utc = now_utc + timedelta(hours=REVIEW_DEADLINE_HOURS)
            now_str = now_utc.strftime('%Y-%m-%dT%H:%M:%SZ')
            deadline_str = deadline_utc.strftime('%Y-%m-%dT%H:%M:%SZ')

            import uuid
            new_entries = []
            for rev in selected:
                uid = rev['user_id']
                entry = {
                    'assignment_id':     str(uuid.uuid4()),
                    'reviewer_id':       uid,
                    'assignment_status': 'assigned',
                    'source':            'auto',
                    'assigned_at':       now_str,
                    'deadline_at':       deadline_str,
                    'completed_at':      None,
                    'vote':              None,
                    'comment':           None,
                    'fail_reasons':      None,
                    'decline_reason':    None,
                    'conflict_flag':     1 if uid in conflict_ids else 0,
                    'reviewer_snapshot': {
                        'username':           rev.get('username'),
                        'institution_domain': rev.get('institution_domain'),
                        'institution_name':   rev.get('institution_name'),
                    },
                }
                new_entries.append(entry)

            updated_votes = existing_votes + new_entries
            pass_count = sum(1 for e in updated_votes if e.get('vote') == 'pass')
            fail_count = sum(1 for e in updated_votes if e.get('vote') == 'fail')

            cursor.execute('''
                UPDATE submissions
                SET review_votes = ?,
                    review_status = 'assigned',
                    pass_votes = ?,
                    fail_votes = ?,
                    pool_breakdown = NULL
                WHERE id = ?
            ''', (json.dumps(updated_votes), pass_count, fail_count, submission_id))

            conn.commit()
            return {'status': 'assigned', 'assigned': len(new_entries)}

        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def assign_specific_reviewer(submission_id, reviewer_id, source='invite'):
        """Assign a specific reviewer to a submission without pool selection."""
        from ...config import REVIEW_DEADLINE_HOURS
        from datetime import datetime, timezone, timedelta
        import uuid

        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute('''
                SELECT s.id, s.user_id, s.review_votes, s.review_status, s.pool_breakdown,
                       r.institution_domain as submitter_institution
                FROM submissions s
                LEFT JOIN reviewers r ON r.user_id = s.user_id
                WHERE s.id = ?
            ''', (submission_id,))
            sub = cursor.fetchone()
            if not sub:
                raise ValueError('Submission not found')

            sub = dict(sub)
            status = sub.get('review_status')
            if status is None:
                raise ValueError('NO_REVIEW_REQUEST')
            if status in ('approved', 'rejected', 'awaiting_admin'):
                raise ValueError('REVIEW_CLOSED')

            cursor.execute('''
                SELECT r.user_id, r.institution_domain, r.institution_name,
                       r.revoked_at, r.application_status,
                       u.username, u.role, u.status
                FROM reviewers r
                JOIN users u ON u.id = r.user_id
                WHERE r.user_id = ?
            ''', (reviewer_id,))
            rev = cursor.fetchone()
            if not rev:
                raise ValueError('REVIEWER_NOT_FOUND')
            rev = dict(rev)
            if rev.get('revoked_at'):
                raise ValueError('REVIEWER_REVOKED')
            if rev.get('status') in ('blocked', 'paused'):
                raise ValueError('REVIEWER_INACTIVE')
            if rev.get('role') not in ('reviewer', 'admin'):
                raise ValueError('REVIEWER_ROLE_REQUIRED')

            votes = json.loads(sub['review_votes'] or '[]')
            for entry in votes:
                if entry.get('reviewer_id') == reviewer_id:
                    return {
                        'status': 'already_assigned',
                        'assignment': entry,
                        'review_status': status,
                    }

            now_utc = datetime.now(timezone.utc)
            deadline_utc = now_utc + timedelta(hours=REVIEW_DEADLINE_HOURS)
            now_str = now_utc.strftime('%Y-%m-%dT%H:%M:%SZ')
            deadline_str = deadline_utc.strftime('%Y-%m-%dT%H:%M:%SZ')

            submitter_inst = (sub.get('submitter_institution') or '').lower()
            reviewer_inst = (rev.get('institution_domain') or '').lower()
            conflict_flag = 1 if (submitter_inst and reviewer_inst and submitter_inst == reviewer_inst) else 0

            entry = {
                'assignment_id':     str(uuid.uuid4()),
                'reviewer_id':       reviewer_id,
                'assignment_status': 'assigned',
                'source':            source,
                'assigned_at':       now_str,
                'deadline_at':       deadline_str,
                'completed_at':      None,
                'vote':              None,
                'comment':           None,
                'fail_reasons':      None,
                'decline_reason':    None,
                'conflict_flag':     conflict_flag,
                'reviewer_snapshot': {
                    'username':           rev.get('username'),
                    'institution_domain': rev.get('institution_domain'),
                    'institution_name':   rev.get('institution_name'),
                },
            }
            votes.append(entry)
            pass_count = sum(1 for e in votes if e.get('vote') == 'pass')
            fail_count = sum(1 for e in votes if e.get('vote') == 'fail')

            new_status = status
            if status in ('pending', 'insufficient_pool'):
                new_status = 'assigned'

            cursor.execute('''
                UPDATE submissions
                SET review_votes = ?,
                    review_status = ?,
                    pass_votes = ?,
                    fail_votes = ?,
                    pool_breakdown = ?
                WHERE id = ?
            ''', (
                json.dumps(votes),
                new_status,
                pass_count,
                fail_count,
                None if new_status != 'insufficient_pool' else sub.get('pool_breakdown'),
                submission_id,
            ))
            conn.commit()
            return {
                'status': 'assigned',
                'assignment': entry,
                'review_status': new_status,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def submit_vote(submission_id, reviewer_id, vote, comment=None, fail_reasons=None):
        """
        Submit a pass/fail vote for a reviewer's assignment.
        Wrapped in BEGIN IMMEDIATE; re-reads live counts atomically.

        Panel state semantics:
          * Every assigned, non-declined / non-expired reviewer is allowed to
            cast a vote — the panel does NOT short-circuit on a running tally.
          * `review_status` only transitions to `'awaiting_admin'` once ALL
            active assignments have a final state (`voted`). Until then it
            stays in `'under_review'` (or `'assigned'` for the very first
            vote that hasn't moved the panel yet).
          * `review_outcome` is computed from the pass/fail tally and is only
            written once the panel is complete. Ties are recorded as `'fail'`
            (conservative default — admin can still override).
        """
        from ...config import (FAIL_REASON_TAXONOMY, FAIL_COMMENT_MIN_LEN,
                               COMMENT_MAX_LEN, MIN_REVIEWERS_PER_REQUEST)
        from datetime import datetime, timezone

        if vote not in ('pass', 'fail'):
            raise ValueError('vote must be pass or fail')

        comment = (comment or '').strip()
        if len(comment) > COMMENT_MAX_LEN:
            raise ValueError(f'comment exceeds {COMMENT_MAX_LEN} characters')

        if vote == 'fail':
            if len(comment) < FAIL_COMMENT_MIN_LEN:
                raise ValueError('COMMENT_REQUIRED_FOR_FAIL')
            if not fail_reasons:
                raise ValueError('COMMENT_REQUIRED_FOR_FAIL')
            invalid = set(fail_reasons) - set(FAIL_REASON_TAXONOMY)
            if invalid:
                raise ValueError(f'Invalid fail_reasons: {invalid}')

        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()

            cursor.execute('''
                SELECT s.review_votes, s.review_status,
                       u.username, rv.institution_domain
                FROM submissions s
                JOIN users u ON u.id = ?
                LEFT JOIN reviewers rv ON rv.user_id = ?
                WHERE s.id = ?
            ''', (reviewer_id, reviewer_id, submission_id))
            row = cursor.fetchone()
            if not row:
                raise ValueError('Submission not found')

            row = dict(row)
            # Distinguish terminal admin-closed state (approved/rejected)
            # from genuinely pre-open / mid-flight states so the API layer
            # can surface a clear, actionable message instead of the
            # ambiguous "not currently under review".
            if row['review_status'] in ('approved', 'rejected'):
                raise ValueError('REVIEW_CLOSED_BY_ADMIN')
            if row['review_status'] not in ('assigned', 'under_review'):
                raise ValueError('This submission is not currently under review')

            votes = json.loads(row['review_votes'] or '[]')

            # Find this reviewer's entry
            entry_idx = None
            for i, e in enumerate(votes):
                if e.get('reviewer_id') == reviewer_id:
                    entry_idx = i
                    break

            if entry_idx is None:
                raise ValueError('No assignment found for this reviewer on this submission')

            entry = votes[entry_idx]
            if entry.get('assignment_status') == 'voted':
                raise ValueError('Vote already submitted')

            # Must accept the assignment before voting.
            if entry.get('assignment_status') != 'accepted':
                raise ValueError('MUST_ACCEPT_FIRST')

            # Capture reviewer_snapshot at vote time
            now_utc = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            reviewer_snapshot = {
                'username':           row['username'],
                'institution_domain': row['institution_domain'],
            }

            # Update the entry
            entry['vote'] = vote
            entry['comment'] = comment
            entry['fail_reasons'] = fail_reasons
            entry['assignment_status'] = 'voted'
            entry['completed_at'] = now_utc
            entry['reviewer_snapshot'] = reviewer_snapshot
            votes[entry_idx] = entry

            # Recompute live tallies
            pass_count = sum(1 for e in votes if e.get('vote') == 'pass')
            fail_count = sum(1 for e in votes if e.get('vote') == 'fail')
            active_entries = [e for e in votes
                              if e.get('assignment_status') not in ('declined', 'expired')]
            total_assigned = len(active_entries)

            # Panel-completion detection: all reviewers on the active roster
            # must have a final 'voted' status before we hand the request
            # over to the admin. We deliberately do NOT short-circuit on a
            # running pass/fail tally — every reviewer's feedback is
            # collected first so the admin sees the full audit trail.
            voted_count = sum(1 for e in active_entries
                              if e.get('assignment_status') == 'voted')

            new_status = row['review_status']
            review_outcome = None
            if total_assigned > 0 and voted_count >= total_assigned:
                new_status = 'awaiting_admin'
                # Pick the winning side from the final tally. Ties resolve
                # to 'fail' as a conservative default — admin can override.
                review_outcome = 'pass' if pass_count > fail_count else 'fail'
            else:
                new_status = 'under_review'

            cursor.execute('''
                UPDATE submissions
                SET review_votes = ?,
                    pass_votes = ?,
                    fail_votes = ?,
                    review_status = ?,
                    review_outcome = ?
                WHERE id = ?
            ''', (json.dumps(votes), pass_count, fail_count,
                  new_status, review_outcome, submission_id))

            conn.commit()
            return {
                'vote': vote,
                'pass_votes': pass_count,
                'fail_votes': fail_count,
                'review_status': new_status,
                'review_outcome': review_outcome,
            }

        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def get_assignments_for_reviewer(reviewer_id, page=1, limit=50):
        """Get all assignments (review_votes entries) for a specific reviewer across all submissions."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.id as submission_id, s.filename, s.domain_tag,
                   s.review_status, s.review_votes,
                   strftime('%Y-%m-%dT%H:%M:%SZ', s.review_requested_at) as review_requested_at,
                   u.username as submitter_name
            FROM submissions s
            JOIN users u ON u.id = s.user_id
            WHERE s.review_votes IS NOT NULL
              AND s.review_votes != '[]'
              AND s.review_status IS NOT NULL
        ''')
        rows = cursor.fetchall()
        conn.close()

        assignments = []
        for row in rows:
            row = dict(row)
            votes = json.loads(row['review_votes'] or '[]')
            for entry in votes:
                if entry.get('reviewer_id') == reviewer_id:
                    assignments.append({
                        'submission_id':    row['submission_id'],
                        'filename':         row['filename'],
                        'domain_tag':       row['domain_tag'],
                        'review_status':    row['review_status'],
                        'review_requested_at': row['review_requested_at'],
                        **entry,
                    })
                    break

        # Sort by assigned_at desc
        assignments.sort(key=lambda a: a.get('assigned_at') or '', reverse=True)

        total = len(assignments)
        offset = (page - 1) * limit
        return {
            'assignments': assignments[offset:offset + limit],
            'total': total,
            'page': page,
            'limit': limit,
        }

    @staticmethod
    def get_assignment_detail(submission_id, reviewer_id):
        """Get a single assignment entry for a reviewer on a specific submission."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.id as submission_id, s.filename, s.domain_tag,
                   s.review_status, s.review_votes,
                   strftime('%Y-%m-%dT%H:%M:%SZ', s.review_requested_at) as review_requested_at
            FROM submissions s
            WHERE s.id = ?
        ''', (submission_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        row = dict(row)
        votes = json.loads(row['review_votes'] or '[]')
        for entry in votes:
            if entry.get('reviewer_id') == reviewer_id:
                return {
                    'submission_id':    row['submission_id'],
                    'filename':         row['filename'],
                    'domain_tag':       row['domain_tag'],
                    'review_status':    row['review_status'],
                    'review_requested_at': row['review_requested_at'],
                    **entry,
                }
        return None


    @staticmethod
    def accept_assignment(submission_id, reviewer_id):
        """
        Reviewer transitions their assignment from 'assigned' -> 'accepted'.
        Rejects from any other state with a clear ValueError.

        Closed-panel guard: if the admin has already finalized this
        submission (`review_status` in {'approved','rejected'}) we raise
        `REVIEW_CLOSED_BY_ADMIN` before touching the JSON. Without this
        guard, accepting silently mutated archived rows.
        """
        from datetime import datetime, timezone
        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute(
                'SELECT review_votes, review_status FROM submissions WHERE id = ?',
                (submission_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError('Submission not found')

            row = dict(row)
            if row['review_status'] in ('approved', 'rejected'):
                raise ValueError('REVIEW_CLOSED_BY_ADMIN')

            votes = json.loads(row['review_votes'] or '[]')

            entry_idx = None
            for i, e in enumerate(votes):
                if e.get('reviewer_id') == reviewer_id:
                    entry_idx = i
                    break
            if entry_idx is None:
                raise ValueError('No assignment found for this reviewer')

            entry = votes[entry_idx]
            current_status = entry.get('assignment_status')
            if current_status == 'cancelled':
                # Belt-and-braces: per-entry cancellation also blocks accept.
                raise ValueError('REVIEW_CLOSED_BY_ADMIN')
            if current_status == 'accepted':
                # Idempotent — no-op
                conn.commit()
                return {'assignment_status': 'accepted', 'changed': False}
            if current_status != 'assigned':
                raise ValueError(
                    f"Cannot accept from status '{current_status}'"
                )

            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            entry['assignment_status'] = 'accepted'
            entry['accepted_at'] = now_str
            votes[entry_idx] = entry

            cursor.execute(
                'UPDATE submissions SET review_votes = ? WHERE id = ?',
                (json.dumps(votes), submission_id)
            )
            conn.commit()
            return {'assignment_status': 'accepted', 'changed': True}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def decline_assignment(submission_id, reviewer_id, decline_reason=None, decline_reason_category=None):
        """
        Reviewer transitions their assignment 'assigned'|'accepted' -> 'declined',
        captures an optional decline_reason (<= DECLINE_REASON_MAX_LEN) and a
        structured `decline_reason_category` (one of `DECLINE_REASON_TAXONOMY`),
        evaluates the rolling-window pause threshold inside the same
        `BEGIN IMMEDIATE`, and then synchronously calls
        assign_many(submission_id, 1) to backfill the slot from the remaining
        eligible pool.

        Closed-panel guard: if the admin has already finalized this
        submission (`review_status` in {'approved','rejected'}) we raise
        `REVIEW_CLOSED_BY_ADMIN` BEFORE the JSON mutation AND before the
        synchronous `assign_many` backfill. Without this guard, declining
        an already-finalized submission would pull a fresh reviewer into
        a closed panel — giving them the same dead-end experience.

        Auto-pause (decline-handling accountability layer): after writing
        the declined entry, `Reviewer._evaluate_and_apply_pause(cursor,
        reviewer_id)` is called inside the same transaction. If the
        reviewer's rolling-window countable-decline count crosses
        `REVIEWER_DECLINE_HARD_LIMIT`, their `users.status` flips to
        'paused' and `reviewers.paused_at`/`paused_until`/`paused_reason`
        are stamped — atomically with the JSON mutation, so two
        near-simultaneous declines can't both slip past the flip.
        See .junie/plans/decline-handling-implementation.md.
        """
        from ...config import DECLINE_REASON_MAX_LEN, DECLINE_REASON_TAXONOMY
        from datetime import datetime, timezone

        if decline_reason is not None:
            decline_reason = (decline_reason or '').strip()
            if len(decline_reason) > DECLINE_REASON_MAX_LEN:
                raise ValueError(
                    f'decline_reason exceeds {DECLINE_REASON_MAX_LEN} characters'
                )

        # Validate the structured category. Missing/None is allowed and is
        # stored as 'unspecified', which the aggregation treats as countable
        # (matches the legacy behaviour for entries without the field).
        if decline_reason_category is not None:
            decline_reason_category = (decline_reason_category or '').strip().lower()
            if decline_reason_category == '':
                decline_reason_category = None
            elif decline_reason_category not in DECLINE_REASON_TAXONOMY:
                raise ValueError('INVALID_DECLINE_CATEGORY')
        category_to_store = decline_reason_category or 'unspecified'

        conn = get_db_connection()
        pause_result = ('ok', 0)
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute(
                'SELECT review_votes, review_status FROM submissions WHERE id = ?',
                (submission_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError('Submission not found')

            row = dict(row)
            if row['review_status'] in ('approved', 'rejected'):
                raise ValueError('REVIEW_CLOSED_BY_ADMIN')

            votes = json.loads(row['review_votes'] or '[]')

            entry_idx = None
            for i, e in enumerate(votes):
                if e.get('reviewer_id') == reviewer_id:
                    entry_idx = i
                    break
            if entry_idx is None:
                raise ValueError('No assignment found for this reviewer')

            entry = votes[entry_idx]
            current_status = entry.get('assignment_status')
            if current_status == 'cancelled':
                raise ValueError('REVIEW_CLOSED_BY_ADMIN')
            if current_status not in ('assigned', 'accepted'):
                raise ValueError(
                    f"Cannot decline from status '{current_status}'"
                )

            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            entry['assignment_status'] = 'declined'
            entry['declined_at'] = now_str
            entry['decline_reason'] = decline_reason or None
            entry['decline_reason_category'] = category_to_store
            # Initialize waive flags so the JSON shape is stable. Admin can
            # later flip `waived: true` via Submission.waive_decline_event.
            entry.setdefault('waived', False)
            entry.setdefault('waived_by', None)
            entry.setdefault('waived_at', None)
            votes[entry_idx] = entry

            cursor.execute(
                'UPDATE submissions SET review_votes = ? WHERE id = ?',
                (json.dumps(votes), submission_id)
            )

            # Evaluate threshold + apply pause inside the same transaction.
            # Returns ('paused' | 'soft_warning' | 'ok', countable_declines).
            pause_result = Reviewer._evaluate_and_apply_pause(cursor, reviewer_id)

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        # Post-commit notification side effects. Keeping these out of the
        # transaction matches the rest of the codebase (notifications use
        # their own short connections and shouldn't block the decline path
        # on lock contention).
        verdict, countable = pause_result
        try:
            if verdict == 'paused':
                Notification.create(
                    reviewer_id,
                    'Reviewer account paused',
                    (
                        f"Your reviewer account has been automatically paused after "
                        f"{countable} countable declines in the rolling window. You "
                        f"will not receive new assignments until the window rolls "
                        f"over or an admin unpauses you. Existing assignments are "
                        f"unaffected."
                    ),
                    type='warning',
                )
                # Notify every admin so the auto-pause is visible without a
                # dashboard refresh. Use a short query for the admin lookup.
                admin_conn = get_db_connection()
                try:
                    admin_rows = admin_conn.execute(
                        "SELECT id FROM users WHERE role = 'admin'"
                    ).fetchall()
                finally:
                    admin_conn.close()
                for ar in admin_rows:
                    try:
                        Notification.create(
                            ar['id'],
                            'Reviewer auto-paused',
                            (
                                f"Reviewer user_id={reviewer_id} was auto-paused "
                                f"after {countable} countable declines in the "
                                f"rolling window."
                            ),
                            type='warning',
                        )
                    except Exception:
                        # Notification failures must never break the decline
                        # path.
                        pass
            elif verdict == 'soft_warning':
                Notification.create(
                    reviewer_id,
                    'Decline-threshold warning',
                    (
                        f"You have accumulated {countable} countable declines in "
                        f"the rolling window. Crossing the hard limit will pause "
                        f"your reviewer account."
                    ),
                    type='info',
                )
        except Exception:
            # Defensive: never let notification I/O fail the decline.
            pass

        # Synchronously backfill from the remaining pool. assign_many opens its
        # own connection and excludes anyone already in review_votes (including
        # the just-declined reviewer), so duplicates are impossible. If the
        # reviewer was just auto-paused, they are now also excluded by the
        # widened `u.status NOT IN ('blocked','paused')` predicate — which can
        # legitimately collapse the panel to `insufficient_pool`. The
        # `pool_breakdown` written by assign_many surfaces this to admins.
        backfill = Submission.assign_many(submission_id, count=1)
        return {
            'assignment_status': 'declined',
            'backfill': backfill,
            'pause_verdict': verdict,
            'countable_declines': countable,
        }

    @staticmethod
    def waive_decline_event(submission_id, reviewer_id, admin_id):
        """Admin marks a single decline JSON entry as waived.

        Locates the matching declined entry inside `submissions.review_votes`
        and flips `waived=true`, stamping `waived_by` and `waived_at`. Then
        re-evaluates the reviewer's pause state inside the same
        transaction so a waiver that drops the count below
        `REVIEWER_DECLINE_HARD_LIMIT` can immediately auto-unpause the
        reviewer.

        Returns a dict:
            {
              'submission_id', 'reviewer_id',
              'waived': True,
              'pause_verdict': 'paused'|'soft_warning'|'ok'|'unpaused',
              'countable_declines': int,
            }
        Raises `ValueError('NOT_FOUND')` if no matching declined entry
        exists, `ValueError('ALREADY_WAIVED')` if the entry is already
        waived.
        """
        from ...config import REVIEWER_DECLINE_HARD_LIMIT

        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute(
                'SELECT review_votes FROM submissions WHERE id = ?',
                (submission_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError('Submission not found')
            votes = json.loads((row['review_votes'] or '[]'))

            target = None
            for entry in votes:
                if (entry.get('reviewer_id') == reviewer_id
                        and entry.get('assignment_status') == 'declined'):
                    target = entry
                    break
            if target is None:
                raise ValueError('NOT_FOUND')
            if target.get('waived'):
                raise ValueError('ALREADY_WAIVED')

            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            target['waived']    = True
            target['waived_by'] = admin_id
            target['waived_at'] = now_str

            cursor.execute(
                'UPDATE submissions SET review_votes = ? WHERE id = ?',
                (json.dumps(votes), submission_id),
            )

            # Re-evaluate. If the reviewer was auto-paused and the waiver
            # drops them below HARD_LIMIT, flip them back to active inside
            # the same transaction so the admin's action is atomic.
            cursor.execute(
                'SELECT paused_at, paused_reason FROM reviewers WHERE user_id = ?',
                (reviewer_id,),
            )
            rev_row = cursor.fetchone()
            was_auto_paused = bool(
                rev_row
                and rev_row['paused_at']
                and (rev_row['paused_reason'] or '').startswith('auto:')
            )

            counts = Reviewer._aggregate_assignment_counts(
                reviewer_id, conn=conn,
            )
            countable = counts['countable_declines']

            unpaused_now = False
            if was_auto_paused and countable < REVIEWER_DECLINE_HARD_LIMIT:
                cursor.execute(
                    '''
                    UPDATE reviewers SET
                        paused_at          = NULL,
                        paused_by          = NULL,
                        paused_reason      = NULL,
                        paused_until       = NULL,
                        last_pause_eval_at = ?
                    WHERE user_id = ?
                    ''',
                    (
                        datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'),
                        reviewer_id,
                    ),
                )
                cursor.execute(
                    "UPDATE users SET status = 'active' WHERE id = ? AND status = 'paused'",
                    (reviewer_id,),
                )
                unpaused_now = True

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        # Best-effort notifications post-commit.
        try:
            Notification.create(
                reviewer_id,
                'Decline event waived',
                (
                    'An administrator has waived one of your decline events. '
                    'It no longer counts toward the pause threshold.'
                ),
                type='info',
            )
            if unpaused_now:
                Notification.create(
                    reviewer_id,
                    'Reviewer account reactivated',
                    (
                        'After the waiver, your countable decline count has '
                        'dropped below the threshold. Your reviewer account '
                        'is active again.'
                    ),
                    type='info',
                )
        except Exception:
            pass

        return {
            'submission_id':     submission_id,
            'reviewer_id':       reviewer_id,
            'waived':            True,
            'pause_verdict':     'unpaused' if unpaused_now else (
                                    'paused' if was_auto_paused else 'ok'
                                 ),
            'countable_declines': countable,
        }

    @staticmethod
    def expire_overdue_assignments():
        """
        Lazy expiry sweep — idempotent. For every active assignment
        (assignment_status IN ('assigned','accepted')) whose deadline_at has
        passed, mark it 'expired' and synchronously backfill one replacement
        for the same submission.

        Returns a list of (submission_id, expired_count, backfill_result) for
        each submission that had at least one expiry.
        """
        from datetime import datetime, timezone

        now_str = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

        # Phase 1: scan + mutate JSON inside one transaction.
        conn = get_db_connection()
        affected = []  # list of (submission_id, expired_count)
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, review_votes
                FROM submissions
                WHERE review_status IN ('assigned','under_review')
                  AND review_votes IS NOT NULL
                  AND review_votes != '[]'
            ''')
            rows = [dict(r) for r in cursor.fetchall()]

            for row in rows:
                votes = json.loads(row['review_votes'] or '[]')
                changed = 0
                for entry in votes:
                    status = entry.get('assignment_status')
                    deadline = entry.get('deadline_at')
                    if status in ('assigned', 'accepted') and deadline and deadline <= now_str:
                        entry['assignment_status'] = 'expired'
                        entry['expired_at'] = now_str
                        changed += 1
                if changed:
                    cursor.execute(
                        'UPDATE submissions SET review_votes = ? WHERE id = ?',
                        (json.dumps(votes), row['id'])
                    )
                    affected.append((row['id'], changed))

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        # Phase 2: trigger backfills outside the sweep transaction. Each call
        # to assign_many opens its own BEGIN IMMEDIATE.
        results = []
        for submission_id, expired_count in affected:
            try:
                bf = Submission.assign_many(submission_id, count=expired_count)
            except Exception as e:
                bf = {'status': 'backfill_failed', 'error': str(e)}
            results.append((submission_id, expired_count, bf))
        return results

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

    # ------------------------------------------------------------------
    # Admin Finalize + Promotion Pipeline
    # ------------------------------------------------------------------
    @staticmethod
    def admin_decision(submission_id, admin_id, decision, reason=None,
                       title=None, author=None, force=False):
        """
        Admin approves or rejects a peer-review request for a submission.

        decision: 'approve' or 'reject'.
        reason  : optional free-form audit note. REQUIRED when admin overrides
                  before the panel has finished voting (review_status not in
                  awaiting_admin).
        title   : (approve only) admin-supplied paper title for the new
                  papers row.
        author  : (approve only) admin-supplied author name.
        force   : (approve only) bypass DUPLICATE_PAPER guard.

        Side-effects (in the same write transaction as the status flip):
          * Every still-in-flight reviewer assignment (assignment_status
            in {'assigned','accepted'}) on this submission is closed by
            setting assignment_status='cancelled', cancelled_at=<now>,
            and cancellation_reason='admin_finalized_<approve|reject>'.
            This guarantees no reviewer is left with a phantom row in
            their queue after the admin closes the panel.

        Returns dict:
          - on approve: { decision, review_status='approved',
                          cancelled_assignments, paper_id, content_hash }
          - on reject : { decision, review_status='rejected',
                          cancelled_assignments }

        Raises ValueError with one of:
          'INVALID_DECISION'             — decision not in approve/reject
          'SUBMISSION_NOT_FOUND'
          'NO_REVIEW_REQUEST'            — submission has no review_status set
          'ALREADY_DECIDED'              — already approved/rejected
          'OVERRIDE_REASON_REQUIRED'     — overriding before the panel has finished voting, without a reason
          'DUPLICATE_PAPER'              — content_hash already in corpus (approve)
          'NOT_ELIGIBLE_FOR_PROMOTION'   — submission has no content (approve)
        """
        if decision not in ('approve', 'reject'):
            raise ValueError('INVALID_DECISION')

        conn = get_db_connection()
        try:
            cursor = conn.cursor()

            # Validate state machine — done outside BEGIN IMMEDIATE so we can
            # raise quickly on user errors without holding a write lock.
            row = cursor.execute(
                "SELECT review_status, review_outcome FROM submissions WHERE id = ?",
                (submission_id,),
            ).fetchone()
            if not row:
                raise ValueError('SUBMISSION_NOT_FOUND')
            current_status = row['review_status']
            if current_status is None:
                raise ValueError('NO_REVIEW_REQUEST')
            if current_status in ('approved', 'rejected'):
                raise ValueError('ALREADY_DECIDED')

            # 'awaiting_admin' is the canonical "every reviewer has voted,
            # panel is closed" state. Anything else (pending / assigned /
            # under_review / insufficient_pool) means admin is overriding
            # before the panel has finished voting, which the plan
            # requires to carry an explicit reason.
            is_panel_incomplete_override = current_status != 'awaiting_admin'
            if is_panel_incomplete_override and not (reason and reason.strip()):
                raise ValueError('OVERRIDE_REASON_REQUIRED')

            # ---- APPROVE: run the Promotion Pipeline FIRST so that if it
            # fails (e.g. duplicate), we never leave the submission in a
            # half-approved state. ----
            promotion_result = None
            if decision == 'approve':
                # Local import avoids circular import at module load time.
                from ..utils.promotion import promote_submission
                promotion_result = promote_submission(
                    submission_id,
                    title=title,
                    author=author,
                    force=force,
                )

            # ---- Persist the audit fields + final review_status, and
            # close any still-in-flight reviewer assignments in the SAME
            # transaction. Without this, reviewers who hadn't voted yet
            # would see a phantom row in their queue and only discover
            # the panel was already closed when they tried to vote. ----
            new_status = 'approved' if decision == 'approve' else 'rejected'
            cancellation_reason = f'admin_finalized_{decision}'
            try:
                cursor.execute('BEGIN IMMEDIATE')

                # Re-read review_votes inside the write lock so we don't
                # race with a concurrent accept/decline/vote.
                vote_row = cursor.execute(
                    'SELECT review_votes FROM submissions WHERE id = ?',
                    (submission_id,),
                ).fetchone()
                votes = json.loads((vote_row['review_votes'] if vote_row else None) or '[]')
                from datetime import datetime, timezone
                cancelled_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                cancelled_count = 0
                for entry in votes:
                    if entry.get('assignment_status') in ('assigned', 'accepted'):
                        entry['assignment_status']   = 'cancelled'
                        entry['cancelled_at']        = cancelled_at
                        entry['cancellation_reason'] = cancellation_reason
                        cancelled_count += 1

                cursor.execute(
                    '''
                    UPDATE submissions
                       SET review_status         = ?,
                            admin_decision        = ?,
                           admin_decided_by      = ?,
                           admin_decided_at      = CURRENT_TIMESTAMP,
                           admin_decision_reason = ?,
                           review_votes          = ?
                     WHERE id = ?
                    ''',
                    (new_status, new_status, admin_id,
                     (reason or None), json.dumps(votes), submission_id),
                )
                cursor.execute(
                    '''
                    UPDATE reviewer_invites
                    SET status = 'revoked',
                        token_hash = 'revoked:' || token_hash
                    WHERE submission_id = ? AND status = 'pending'
                    ''',
                    (submission_id,),
                )
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                raise

            response = {
                'decision':              decision,
                'review_status':         new_status,
                'cancelled_assignments': cancelled_count,
            }
            if promotion_result is not None:
                response.update({
                    'paper_id':     promotion_result['paper_id'],
                    'content_hash': promotion_result['content_hash'],
                })
            return response
        finally:
            conn.close()


class SimilarityResult:
    _OVERLAPPING_TERMS_CACHE = {}
    _OVERLAPPING_TERMS_CACHE_TTL_SECONDS = 60
    _OVERLAPPING_TERMS_CACHE_LOCK = Lock()

    @classmethod
    def _normalize_overlapping_terms_filters(cls, limit, min_count):
        """Normalize and clamp overlapping terms filters."""
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 15

        try:
            min_count = int(min_count)
        except (TypeError, ValueError):
            min_count = 1

        limit = max(1, min(limit, 50))
        min_count = max(1, min(min_count, 1000))
        return limit, min_count

    @classmethod
    def invalidate_user_overlapping_terms_cache(cls, user_id):
        """Invalidate cached overlapping terms entries for a user."""
        try:
            normalized_user_id = int(user_id)
        except (TypeError, ValueError):
            return

        with cls._OVERLAPPING_TERMS_CACHE_LOCK:
            keys_to_remove = [
                key for key in cls._OVERLAPPING_TERMS_CACHE
                if key[0] == normalized_user_id
            ]
            for key in keys_to_remove:
                cls._OVERLAPPING_TERMS_CACHE.pop(key, None)

    @classmethod
    def get_user_overlapping_terms(cls, user_id, limit=15, min_count=1):
        """Aggregate top overlapping terms for a user from stored match evidence."""
        from ..utils.text_processing import TextProcessor

        try:
            normalized_user_id = int(user_id)
        except (TypeError, ValueError):
            return {
                'terms': [],
                'analyzed_submissions': 0,
            }

        limit, min_count = cls._normalize_overlapping_terms_filters(limit, min_count)
        cache_key = (normalized_user_id, limit, min_count)
        now_ts = time.time()

        with cls._OVERLAPPING_TERMS_CACHE_LOCK:
            expired_keys = [
                key for key, payload in cls._OVERLAPPING_TERMS_CACHE.items()
                if now_ts - payload['cached_at'] > cls._OVERLAPPING_TERMS_CACHE_TTL_SECONDS
            ]
            for key in expired_keys:
                cls._OVERLAPPING_TERMS_CACHE.pop(key, None)

            cached_payload = cls._OVERLAPPING_TERMS_CACHE.get(cache_key)
            if cached_payload:
                cached_data = cached_payload['data']
                return {
                    'terms': [dict(item) for item in cached_data['terms']],
                    'analyzed_submissions': cached_data['analyzed_submissions'],
                }

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                SELECT COUNT(*) AS analyzed_submissions
                FROM submissions
                WHERE user_id = ?
                  AND status = 'completed'
            ''', (normalized_user_id,))
            analyzed_submissions_row = cursor.fetchone()
            analyzed_submissions = int(
                (analyzed_submissions_row['analyzed_submissions'] if analyzed_submissions_row else 0) or 0
            )

            cursor.execute('''
                SELECT s.id AS submission_id, sr.match_details
                FROM submissions s
                JOIN similarity_results sr ON sr.submission_id = s.id
                WHERE s.user_id = ?
                  AND s.status = 'completed'
                  AND sr.match_details IS NOT NULL
                  AND sr.match_details != ''
            ''', (normalized_user_id,))
            rows = [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

        term_counter = Counter()
        for row in rows:
            raw_match_details = row.get('match_details')
            if not raw_match_details:
                continue

            if isinstance(raw_match_details, dict):
                parsed_match_details = raw_match_details
            else:
                try:
                    parsed_match_details = json.loads(raw_match_details)
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue

            matches = parsed_match_details.get('matches')
            if not isinstance(matches, list):
                continue

            for match in matches:
                if not isinstance(match, dict):
                    continue

                submission_sentence = match.get('submission_sentence')
                if not isinstance(submission_sentence, dict):
                    continue

                sentence_text = submission_sentence.get('text')
                if not isinstance(sentence_text, str) or not sentence_text.strip():
                    continue

                tokens = TextProcessor.clean_text(sentence_text, remove_stopwords=True)
                if tokens:
                    term_counter.update(tokens)

        terms = [
            {'term': term, 'count': count}
            for term, count in term_counter.items()
            if count >= min_count
        ]
        terms.sort(key=lambda item: (-item['count'], item['term']))

        response_data = {
            'terms': terms[:limit],
            'analyzed_submissions': analyzed_submissions,
        }

        with cls._OVERLAPPING_TERMS_CACHE_LOCK:
            cls._OVERLAPPING_TERMS_CACHE[cache_key] = {
                'cached_at': now_ts,
                'data': {
                    'terms': [dict(item) for item in response_data['terms']],
                    'analyzed_submissions': response_data['analyzed_submissions'],
                },
            }

        return response_data

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

    @staticmethod
    def get_by_submission_for_review(submission_id):
        """Softer variant for reviewer detail: returns all rows with
        similarity_score > 0, regardless of match_details content."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT sr.*, p.title, p.author, p.filename,
                   strftime('%Y-%m-%dT%H:%M:%SZ', sr.created_at) as created_at
            FROM similarity_results sr
            JOIN papers p ON sr.paper_id = p.id
            WHERE sr.submission_id = ?
              AND sr.similarity_score > 0
            ORDER BY sr.similarity_score DESC
        ''', (submission_id,))
        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

class Reviewer:
    # ------------------------------------------------------------------
    # Decline-handling accountability layer
    # See .junie/plans/decline-handling-implementation.md
    # ------------------------------------------------------------------
    @staticmethod
    def _aggregate_assignment_counts(reviewer_id, window_days=None, conn=None):
        """Single-query JSON-scan aggregation of a reviewer's recent assignment
        outcomes from `submissions.review_votes`.

        Returns a dict:
            {
                'declines':           int,  # any declined entry inside the window
                'countable_declines': int,  # declined + countable category + not waived
                'expiries':           int,  # expired entries inside the window
                'votes':              int,  # voted entries (lifetime)
                'total_assignments':  int,  # lifetime total entries (any status)
                'window_days':        int,
            }

        If `conn` is provided, the query reuses that connection (so the
        aggregation can run inside the caller's transaction). Otherwise a
        short-lived connection is opened and closed.

        Legacy entries without a `decline_reason_category` are treated as
        'unspecified' and count toward the threshold at full weight — matches
        the documented "unknown reason → assume countable" semantics.
        """
        from ...config import (REVIEWER_DECLINE_WINDOW_DAYS,
                                DECLINE_COUNTABLE_CATEGORIES)
        if window_days is None:
            window_days = REVIEWER_DECLINE_WINDOW_DAYS

        # Window cutoff as an ISO-8601 string. Compared as text against the
        # ISO timestamps stored inside `review_votes` (`declined_at`,
        # `expired_at`). String ordering of ISO-8601 strings is identical to
        # chronological ordering for our fixed format.
        cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).strftime(
            '%Y-%m-%dT%H:%M:%SZ'
        )

        # Build the countable-categories IN-clause dynamically so the tuple in
        # config remains the single source of truth.
        countable_placeholders = ','.join('?' * len(DECLINE_COUNTABLE_CATEGORIES))

        sql = f'''
            WITH window_entries AS (
                SELECT je.value AS entry
                FROM submissions s, json_each(s.review_votes) je
                WHERE s.review_votes IS NOT NULL
                  AND json_extract(je.value, '$.reviewer_id') = ?
            )
            SELECT
                COALESCE(SUM(CASE
                    WHEN json_extract(entry, '$.assignment_status') = 'declined'
                     AND json_extract(entry, '$.declined_at') >= ?
                    THEN 1 ELSE 0 END), 0) AS declines,
                COALESCE(SUM(CASE
                    WHEN json_extract(entry, '$.assignment_status') = 'declined'
                     AND json_extract(entry, '$.declined_at') >= ?
                     AND IFNULL(json_extract(entry, '$.waived'), 0) = 0
                     AND COALESCE(json_extract(entry, '$.decline_reason_category'), 'unspecified')
                         IN ({countable_placeholders})
                    THEN 1 ELSE 0 END), 0) AS countable_declines,
                COALESCE(SUM(CASE
                    WHEN json_extract(entry, '$.assignment_status') = 'expired'
                     AND json_extract(entry, '$.expired_at') >= ?
                    THEN 1 ELSE 0 END), 0) AS expiries,
                COALESCE(SUM(CASE
                    WHEN json_extract(entry, '$.assignment_status') = 'voted'
                    THEN 1 ELSE 0 END), 0) AS votes,
                COUNT(*) AS total_assignments
            FROM window_entries
        '''
        params = [reviewer_id, cutoff, cutoff, *DECLINE_COUNTABLE_CATEGORIES, cutoff]

        owns_conn = conn is None
        if owns_conn:
            conn = get_db_connection()
        try:
            row = conn.execute(sql, params).fetchone()
        finally:
            if owns_conn:
                conn.close()

        if row is None:
            return {
                'declines': 0,
                'countable_declines': 0,
                'expiries': 0,
                'votes': 0,
                'total_assignments': 0,
                'window_days': window_days,
            }
        return {
            'declines': int(row['declines'] or 0),
            'countable_declines': int(row['countable_declines'] or 0),
            'expiries': int(row['expiries'] or 0),
            'votes': int(row['votes'] or 0),
            'total_assignments': int(row['total_assignments'] or 0),
            'window_days': window_days,
        }

    @staticmethod
    def _evaluate_and_apply_pause(cursor, reviewer_id):
        """Evaluate the rolling-window decline threshold for `reviewer_id` and,
        if the hard limit is crossed, flip `users.status='paused'` and stamp
        `reviewers.paused_*` columns — all using the **passed-in cursor** so
        the caller's `BEGIN IMMEDIATE` transaction wraps both the JSON write
        and the pause flip atomically.

        Returns:
            ('paused',         countable_declines)  — hard-limit crossed, status flipped
            ('soft_warning',   countable_declines)  — soft-limit reached but below hard
            ('ok',             countable_declines)  — under both limits, or below grace

        Guarded by:
          - Grace gate: a reviewer with fewer than
            REVIEWER_DECLINE_GRACE_ASSIGNMENTS lifetime assignments cannot be
            auto-paused (avoids penalising new reviewers).
          - Idempotency: if the reviewer is already paused, the pause flip
            is a no-op (only `last_pause_eval_at` is bumped) but the verdict
            is still 'paused' so the caller knows to notify.
        """
        from ...config import (REVIEWER_DECLINE_HARD_LIMIT,
                                REVIEWER_DECLINE_SOFT_LIMIT,
                                REVIEWER_DECLINE_GRACE_ASSIGNMENTS,
                                REVIEWER_DECLINE_WINDOW_DAYS)

        # Reuse caller's connection via the cursor for the aggregation, so the
        # query sees uncommitted writes from the same transaction (notably the
        # just-written declined entry).
        counts = Reviewer._aggregate_assignment_counts(
            reviewer_id,
            window_days=REVIEWER_DECLINE_WINDOW_DAYS,
            conn=cursor.connection,
        )
        countable = counts['countable_declines']
        total = counts['total_assignments']

        now = datetime.now(timezone.utc)
        now_str = now.strftime('%Y-%m-%d %H:%M:%S')

        # Always bump the eval anchor so the lazy sweep has a fresh checkpoint.
        cursor.execute(
            'UPDATE reviewers SET last_pause_eval_at = ? WHERE user_id = ?',
            (now_str, reviewer_id),
        )

        # Inspect current pause state. If already paused, just report
        # 'paused' — the caller decides whether to re-notify.
        cursor.execute(
            'SELECT paused_at FROM reviewers WHERE user_id = ?',
            (reviewer_id,),
        )
        rev_row = cursor.fetchone()
        already_paused = bool(rev_row and rev_row['paused_at'])

        # Grace gate: brand-new reviewers don't get auto-paused.
        if total < REVIEWER_DECLINE_GRACE_ASSIGNMENTS:
            return ('paused' if already_paused else 'ok', countable)

        if countable >= REVIEWER_DECLINE_HARD_LIMIT and not already_paused:
            paused_until = (now + timedelta(days=REVIEWER_DECLINE_WINDOW_DAYS)).strftime(
                '%Y-%m-%d %H:%M:%S'
            )
            cursor.execute(
                '''
                UPDATE reviewers SET
                    paused_at      = ?,
                    paused_by      = NULL,
                    paused_reason  = 'auto:rolling_window_exceeded',
                    paused_until   = ?
                WHERE user_id = ?
                ''',
                (now_str, paused_until, reviewer_id),
            )
            cursor.execute(
                "UPDATE users SET status = 'paused' WHERE id = ? AND status = 'active'",
                (reviewer_id,),
            )
            return ('paused', countable)

        if already_paused:
            return ('paused', countable)
        if countable >= REVIEWER_DECLINE_SOFT_LIMIT:
            return ('soft_warning', countable)
        return ('ok', countable)

    @staticmethod
    def apply(user_id, institution_domain, institution_name, affiliation, institutional_email, bio, expertise_tags=["CS"]):
        """Create or update a reviewer application.

        Issues a fresh institutional-email verification token whenever the
        applicant is new or has changed their `institutional_email`. When
        the email is unchanged and was already verified, the prior
        verification is preserved and no new token is generated.

        Returns the raw token (str) when a verification email should be
        sent, or None when the existing verification still stands.
        """
        from ..utils.email_verification import generate_token, new_expiry

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            # Look up the previous row (if any) to decide whether re-verification
            # is needed. Email comparison is case-insensitive to match how the
            # institution allowlist check normalises email input.
            cursor.execute('''
                SELECT institutional_email, email_verified,
                       last_verification_sent_at, verification_sent_count,
                       verification_window_started_at
                FROM reviewers WHERE user_id = ?
            ''', (user_id,))
            prev = cursor.fetchone()
            same_email = bool(
                prev
                and (prev['institutional_email'] or '').lower() == (institutional_email or '').lower()
            )
            already_verified = bool(prev and prev['email_verified'] and same_email)

            raw_token = None
            token_hash = None
            expires_at = None
            # Rate-limit counters: only bumped when a token is actually issued.
            # The initial send from /apply counts toward the daily resend cap
            # so users can't bypass the quota by re-submitting the form.
            now_str = None
            # Default to existing values to satisfy NOT NULL constraints during
            # the INSERT phase of the UPSERT, even if we're only updating.
            new_count = prev['verification_sent_count'] if prev else 0
            window_start = prev['verification_window_started_at'] if prev else None

            if not already_verified:
                raw_token, token_hash = generate_token()
                expires_at = new_expiry()
                now = datetime.now(timezone.utc)
                now_str = now.strftime('%Y-%m-%d %H:%M:%S')
                new_count, window_start = Reviewer._bump_send_counters(prev, now)

            expertise_tags_json = json.dumps(expertise_tags)
            cursor.execute('''
                INSERT INTO reviewers (user_id, institution_domain, institution_name, affiliation,
                                     institutional_email, bio, expertise_tags, application_status, submitted_at,
                                     email_verified, email_verification_token_hash, email_verification_expires_at,
                                     last_verification_sent_at, verification_sent_count, verification_window_started_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP,
                        ?, ?, ?,
                        ?, ?, ?)
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
                    revoke_reason=NULL,
                    -- Preserve verification iff the email is unchanged; otherwise reset.
                    email_verified                = CASE
                        WHEN LOWER(excluded.institutional_email) = LOWER(reviewers.institutional_email)
                        THEN reviewers.email_verified
                        ELSE 0
                    END,
                    email_verified_at             = CASE
                        WHEN LOWER(excluded.institutional_email) = LOWER(reviewers.institutional_email)
                        THEN reviewers.email_verified_at
                        ELSE NULL
                    END,
                    email_verification_token_hash    = excluded.email_verification_token_hash,
                    email_verification_expires_at    = excluded.email_verification_expires_at,
                    -- Only roll forward send counters when a fresh token was issued.
                    last_verification_sent_at      = COALESCE(excluded.last_verification_sent_at,
                                                              reviewers.last_verification_sent_at),
                    verification_sent_count        = COALESCE(excluded.verification_sent_count,
                                                              reviewers.verification_sent_count),
                    verification_window_started_at = COALESCE(excluded.verification_window_started_at,
                                                              reviewers.verification_window_started_at)
            ''', (
                user_id, institution_domain, institution_name, affiliation,
                institutional_email, bio, expertise_tags_json,
                1 if already_verified else 0, token_hash, expires_at,
                now_str, new_count, window_start,
            ))
            conn.commit()
            return raw_token  # None when no email needs to be sent
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
                   strftime('%Y-%m-%dT%H:%M:%SZ', email_verified_at) as email_verified_at,
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
        """List reviewer applications for admin.

        Supports a synthetic ``status='revoked'`` filter: ``revoke`` flips
        ``application_status`` to ``'rejected'`` and stamps ``revoked_at``.
        Without special handling the plain ``'rejected'`` filter would mix
        rejected applicants and revoked ex-reviewers, so:

        - ``status='revoked'``  → ``revoked_at IS NOT NULL``
        - ``status='rejected'`` → ``application_status='rejected' AND revoked_at IS NULL``
        - ``status='approved' | 'pending'`` → unchanged.
        - ``status=None``       → all rows.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        offset = (page - 1) * limit
        
        query = '''
            SELECT r.*, u.username, u.email,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.submitted_at) as submitted_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.reviewed_at) as reviewed_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.verified_at) as verified_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.email_verified_at) as email_verified_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', r.revoked_at) as revoked_at
            FROM reviewers r 
            JOIN users u ON r.user_id = u.id
        '''
        # Build the WHERE clause once and reuse it for both the SELECT and
        # COUNT queries so paging numbers stay consistent.
        where_clause = ''
        params = []
        if status == 'revoked':
            where_clause = ' WHERE r.revoked_at IS NOT NULL'
        elif status == 'rejected':
            where_clause = " WHERE r.application_status = 'rejected' AND r.revoked_at IS NULL"
        elif status:
            where_clause = ' WHERE r.application_status = ?'
            params.append(status)

        query += where_clause
        query += ' ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?'
        cursor.execute(query, params + [limit, offset])
        apps = [dict(row) for row in cursor.fetchall()]

        for a in apps:
            if a['expertise_tags']:
                a['expertise_tags'] = json.loads(a['expertise_tags'])

        # Total count uses the same WHERE clause (without LIMIT/OFFSET) so
        # pagination math matches the rows the admin actually sees.
        count_query = 'SELECT COUNT(*) as total FROM reviewers r' + where_clause
        cursor.execute(count_query, params)
        total = cursor.fetchone()['total']

        conn.close()
        return apps, total

    @staticmethod
    def is_email_verified(user_id):
        """Return True iff the reviewer row exists and `email_verified=1`."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT email_verified FROM reviewers WHERE user_id = ?",
            (user_id,)
        )
        row = cursor.fetchone()
        conn.close()
        return bool(row and row['email_verified'])

    @staticmethod
    def consume_email_verification(user_id, raw_token):
        """Consume an institutional-email verification token (single-use).

        Validates that the token matches the row's stored hash, that the
        link has not expired, and that it has not already been consumed
        (single-use is enforced by clearing the hash on success).

        Raises:
            ValueError("invalid")           - no row, wrong token, or already consumed.
            ValueError("expired")           - link is past its expiry.
        """
        from ..utils.email_verification import hash_token, is_expired

        if not raw_token:
            raise ValueError("invalid")

        token_hash = hash_token(raw_token)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            cursor.execute('''
                SELECT email_verification_token_hash, email_verification_expires_at,
                       email_verified
                FROM reviewers
                WHERE user_id = ?
            ''', (user_id,))
            row = cursor.fetchone()
            if not row:
                conn.rollback()
                raise ValueError("invalid")

            stored_hash = row['email_verification_token_hash']
            # Single-use enforcement: once cleared, no token can match.
            if not stored_hash or stored_hash != token_hash:
                conn.rollback()
                raise ValueError("invalid")

            if is_expired(row['email_verification_expires_at']):
                conn.rollback()
                raise ValueError("expired")

            now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE reviewers SET
                    email_verified = 1,
                    email_verified_at = ?,
                    email_verification_token_hash = NULL,
                    email_verification_expires_at = NULL
                WHERE user_id = ?
            ''', (now, user_id))
            conn.commit()
            return True
        except ValueError:
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Resend / edit-email rate limit knobs
    # ------------------------------------------------------------------
    # Cooldown between two consecutive verification-email sends for the
    # same applicant. Short enough not to annoy a legitimate user, long
    # enough to defeat trivial click-spamming.
    VERIFICATION_RESEND_COOLDOWN_SECONDS = 60
    # Hard cap on sends per rolling 24h window (covers both the initial
    # /apply send and any user-triggered resends or email edits).
    VERIFICATION_RESEND_DAILY_CAP = 5
    # Window length used for the daily cap.
    VERIFICATION_RESEND_WINDOW_SECONDS = 24 * 60 * 60

    @staticmethod
    def _parse_db_timestamp(ts):
        """Parse a stored UTC timestamp (sqlite TIMESTAMP or ISO 'T' form).

        Returns a timezone-aware `datetime` (UTC) or None if the input is
        falsy or unparseable.
        """
        if not ts:
            return None
        try:
            dt = datetime.fromisoformat(str(ts).replace(' ', 'T').rstrip('Z'))
        except (ValueError, TypeError):
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    @staticmethod
    def _bump_send_counters(row, now):
        """Compute the post-send rate-limit counters without enforcing quotas.

        Used by `Reviewer.apply` (the initial send already happens whether
        or not the limit would be reached, because submitting the form is
        a discrete user action) so subsequent resends start with an
        accurate `count` / `window_start`.

        Returns `(new_count, window_start_iso)`.
        """
        window_secs = Reviewer.VERIFICATION_RESEND_WINDOW_SECONDS
        window_start = Reviewer._parse_db_timestamp(row['verification_window_started_at']) if row else None
        count = int(row['verification_sent_count']) if row and row['verification_sent_count'] is not None else 0
        if window_start is None or (now - window_start).total_seconds() >= window_secs:
            window_start = now
            count = 0
        return count + 1, window_start.strftime('%Y-%m-%d %H:%M:%S')

    @staticmethod
    def _check_resend_rate_limit(row, now):
        """Validate resend quotas for the given reviewer row.

        Returns a tuple `(new_count, window_start_iso)` describing the
        counters to persist if the send is allowed.

        Raises ValueError with a JSON-safe message and an `args[1]` payload
        carrying machine-readable details (`retry_after` seconds, the
        offending limit, etc.) when a quota is exceeded.
        """
        cooldown = Reviewer.VERIFICATION_RESEND_COOLDOWN_SECONDS
        cap = Reviewer.VERIFICATION_RESEND_DAILY_CAP
        window_secs = Reviewer.VERIFICATION_RESEND_WINDOW_SECONDS

        last_sent = Reviewer._parse_db_timestamp(row['last_verification_sent_at']) if row else None
        if last_sent is not None:
            elapsed = (now - last_sent).total_seconds()
            if elapsed < cooldown:
                retry_after = int(cooldown - elapsed) + 1
                err = ValueError(
                    f"Please wait {retry_after} seconds before requesting another verification email."
                )
                err.args = (err.args[0], {'retry_after': retry_after, 'reason': 'cooldown'})
                raise err

        window_start = Reviewer._parse_db_timestamp(row['verification_window_started_at']) if row else None
        count = int(row['verification_sent_count']) if row and row['verification_sent_count'] is not None else 0
        if window_start is None or (now - window_start).total_seconds() >= window_secs:
            # Window expired (or never started) — start a fresh one.
            window_start = now
            count = 0

        if count >= cap:
            seconds_left = int(window_secs - (now - window_start).total_seconds())
            if seconds_left < 0:
                seconds_left = 0
            err = ValueError(
                "You've reached the daily limit for verification-email resends. "
                "Try again in a few hours or contact support if you still can't access your inbox."
            )
            err.args = (err.args[0], {
                'retry_after': seconds_left,
                'reason': 'daily_cap',
                'cap': cap,
            })
            raise err

        return count + 1, window_start.strftime('%Y-%m-%d %H:%M:%S')

    @staticmethod
    def resend_verification(user_id):
        """Re-issue a fresh institutional-email verification token.

        Enforces a per-applicant cooldown and daily cap (see class
        constants). On success, rotates the stored token hash + expiry
        and updates the rate-limit counters.

        Returns: a dict {'raw_token': str, 'institutional_email': str}
        Raises:
            ValueError("not_found")          - no reviewer row.
            ValueError("not_pending")        - application is approved/rejected.
            ValueError("already_verified")   - email already verified, no need to resend.
            ValueError(<human message>, {'retry_after': int, 'reason': str, ...})
                                             - cooldown / daily cap hit.
        """
        from ..utils.email_verification import generate_token, new_expiry

        now = datetime.now(timezone.utc)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            cursor.execute('''
                SELECT institutional_email, application_status, email_verified,
                       last_verification_sent_at, verification_sent_count,
                       verification_window_started_at
                FROM reviewers WHERE user_id = ?
            ''', (user_id,))
            row = cursor.fetchone()
            if not row:
                conn.rollback()
                raise ValueError("not_found")
            if row['application_status'] != 'pending':
                conn.rollback()
                raise ValueError("not_pending")
            if row['email_verified']:
                conn.rollback()
                raise ValueError("already_verified")

            new_count, window_start = Reviewer._check_resend_rate_limit(row, now)

            raw_token, token_hash = generate_token()
            expires_at = new_expiry()
            now_str = now.strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE reviewers SET
                    email_verification_token_hash    = ?,
                    email_verification_expires_at    = ?,
                    last_verification_sent_at        = ?,
                    verification_sent_count          = ?,
                    verification_window_started_at   = ?
                WHERE user_id = ?
            ''', (token_hash, expires_at, now_str, new_count, window_start, user_id))
            conn.commit()
            return {
                'raw_token': raw_token,
                'institutional_email': row['institutional_email'],
            }
        except ValueError:
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def update_email(user_id, new_email):
        """Let an applicant correct the institutional email on a pending application.

        Only allowed while the application is `pending` and not yet
        verified — once approved or verified the email is locked.
        On success, rotates the verification token, resets `email_verified`
        to 0, bumps the rate-limit counters (the caller still sends one
        email, which counts towards the daily cap), and returns the raw
        token so the route can dispatch the mail.

        Returns: {'raw_token': str, 'institutional_email': str}
        Raises:
            ValueError("not_found")          - no reviewer row.
            ValueError("not_pending")        - application not in 'pending' state.
            ValueError("already_verified")   - email already verified (use a new application instead).
            ValueError("invalid_domain")     - the new email doesn't match any allowed institution domain.
            ValueError("same_email")         - new email matches the existing one (nothing to do).
            ValueError("email_taken")        - another applicant already uses this email.
            ValueError(<human message>, {'retry_after': int, ...})
                                             - rate-limit hit (cooldown / daily cap).
        """
        from ..utils.email_verification import generate_token, new_expiry

        new_email = (new_email or '').strip()
        if not new_email:
            raise ValueError("invalid_email")

        # Validate against allowed institution domains (subdomain-safe match,
        # mirrors the check in routes.reviewers.apply).
        from ...config import ALLOWED_INSTITUTION_DOMAINS
        new_email_lower = new_email.lower()
        matched_domain = None
        for _name, domain in ALLOWED_INSTITUTION_DOMAINS:
            if new_email_lower.endswith('@' + domain) or new_email_lower.endswith('.' + domain):
                matched_domain = domain
                break
        if not matched_domain:
            raise ValueError("invalid_domain")

        now = datetime.now(timezone.utc)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            cursor.execute('''
                SELECT institutional_email, application_status, email_verified,
                       last_verification_sent_at, verification_sent_count,
                       verification_window_started_at
                FROM reviewers WHERE user_id = ?
            ''', (user_id,))
            row = cursor.fetchone()
            if not row:
                conn.rollback()
                raise ValueError("not_found")
            if row['application_status'] != 'pending':
                conn.rollback()
                raise ValueError("not_pending")
            if row['email_verified']:
                conn.rollback()
                raise ValueError("already_verified")
            if (row['institutional_email'] or '').lower() == new_email_lower:
                conn.rollback()
                raise ValueError("same_email")

            # Rate-limit changing the email + sending a fresh link.
            new_count, window_start = Reviewer._check_resend_rate_limit(row, now)

            raw_token, token_hash = generate_token()
            expires_at = new_expiry()
            now_str = now.strftime('%Y-%m-%d %H:%M:%S')
            try:
                cursor.execute('''
                    UPDATE reviewers SET
                        institutional_email              = ?,
                        email_verified                   = 0,
                        email_verified_at                = NULL,
                        email_verification_token_hash    = ?,
                        email_verification_expires_at    = ?,
                        last_verification_sent_at        = ?,
                        verification_sent_count          = ?,
                        verification_window_started_at   = ?
                    WHERE user_id = ?
                ''', (new_email, token_hash, expires_at, now_str,
                      new_count, window_start, user_id))
            except sqlite3.IntegrityError as e:
                conn.rollback()
                if "UNIQUE constraint failed: reviewers.institutional_email" in str(e):
                    raise ValueError("email_taken")
                raise
            conn.commit()
            return {
                'raw_token': raw_token,
                'institutional_email': new_email,
            }
        except ValueError:
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def decide(user_id, admin_id, decision, reason=None):
        """Admin decision on reviewer application.

        Approval is gated on institutional-email verification: an admin
        cannot promote an applicant whose `email_verified` flag is 0,
        even if the frontend somehow lets that decision through. This is
        the security anchor — the route layer surfaces the ValueError as
        a 400 with a clear message.
        """
        if decision not in ['approved', 'rejected']:
            raise ValueError("Invalid decision")

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')

            if decision == 'approved':
                cursor.execute(
                    "SELECT email_verified FROM reviewers WHERE user_id = ?",
                    (user_id,)
                )
                row = cursor.fetchone()
                if not row or not row['email_verified']:
                    conn.rollback()
                    raise ValueError(
                        "Cannot approve: applicant's institutional email is not verified."
                    )

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

    @staticmethod
    def ensure_invited_reviewer(user_id, institutional_email, institution_domain=None,
                                institution_name=None, invited_by=None):
        """Upsert a reviewer row for an invited expert and grant reviewer role."""
        now = datetime.now(timezone.utc)
        now_str = now.strftime('%Y-%m-%d %H:%M:%S')
        institutional_email = (institutional_email or '').strip().lower()
        institution_domain = (institution_domain or '').strip().lower() or None
        institution_name = (institution_name or '').strip() or None

        if not institutional_email:
            raise ValueError('invalid_email')

        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            user_row = cursor.execute(
                'SELECT id, role, status FROM users WHERE id = ?',
                (user_id,),
            ).fetchone()
            if not user_row:
                raise ValueError('User not found')
            user_row = dict(user_row)
            if user_row.get('status') in ('blocked', 'paused'):
                raise ValueError('User inactive')

            rev_row = cursor.execute(
                '''
                SELECT user_id, affiliation, expertise_tags, revoked_at
                FROM reviewers WHERE user_id = ?
                ''',
                (user_id,),
            ).fetchone()

            affiliation = 'Invited reviewer'
            expertise_tags = json.dumps(['CS'])
            if rev_row:
                rev_row = dict(rev_row)
                if rev_row.get('affiliation'):
                    affiliation = rev_row['affiliation']
                if rev_row.get('expertise_tags'):
                    expertise_tags = rev_row['expertise_tags']

                cursor.execute(
                    '''
                    UPDATE reviewers SET
                        application_status          = 'approved',
                        reviewed_at                 = ?,
                        reviewed_by                 = ?,
                        decision_reason             = ?,
                        institution_domain          = ?,
                        institution_name            = ?,
                        affiliation                 = ?,
                        institutional_email         = ?,
                        verified_at                 = ?,
                        revoked_at                  = NULL,
                        revoked_by                  = NULL,
                        revoke_reason               = NULL,
                        email_verified              = 1,
                        email_verified_at           = ?,
                        email_verification_token_hash = NULL,
                        email_verification_expires_at = NULL
                    WHERE user_id = ?
                    ''',
                    (
                        now_str,
                        invited_by,
                        'invited',
                        institution_domain,
                        institution_name,
                        affiliation,
                        institutional_email,
                        now_str,
                        now_str,
                        user_id,
                    ),
                )
            else:
                cursor.execute(
                    '''
                    INSERT INTO reviewers (
                        user_id, application_status, submitted_at,
                        reviewed_at, reviewed_by, decision_reason,
                        institution_domain, institution_name, affiliation,
                        institutional_email, bio, expertise_tags, verified_at,
                        revoked_at, revoked_by, revoke_reason,
                        email_verified, email_verified_at,
                        email_verification_token_hash, email_verification_expires_at
                    ) VALUES (
                        ?, 'approved', CURRENT_TIMESTAMP,
                        ?, ?, ?,
                        ?, ?, ?,
                        ?, ?, ?, ?,
                        NULL, NULL, NULL,
                        1, ?,
                        NULL, NULL
                    )
                    ''',
                    (
                        user_id,
                        now_str,
                        invited_by,
                        'invited',
                        institution_domain,
                        institution_name,
                        affiliation,
                        institutional_email,
                        None,
                        expertise_tags,
                        now_str,
                        now_str,
                    ),
                )

            if user_row.get('role') != 'admin':
                cursor.execute(
                    "UPDATE users SET role = 'reviewer' WHERE id = ?",
                    (user_id,),
                )

            conn.commit()
            return True
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Decline-handling accountability layer (Step 4):
    # manual pause / unpause + lazy auto-unpause sweep.
    # See .junie/plans/decline-handling-implementation.md.
    # ------------------------------------------------------------------
    @staticmethod
    def sweep_paused_reviewers():
        """Lazy auto-unpause sweep — idempotent. For every reviewer whose
        `paused_at` is currently set, recompute the rolling-window countable
        decline count; if it has dropped below `REVIEWER_DECLINE_HARD_LIMIT`,
        flip `users.status` back to `'active'` and clear
        `reviewers.paused_at`/`paused_until`.

        Mirrors the shape of `Submission.expire_overdue_assignments`:
          - Phase 1 (read): list candidate user_ids inside a short read.
          - Phase 2 (recompute + write): per reviewer, run the aggregation
            and, if eligible, flip status inside `BEGIN IMMEDIATE`.

        Returns a list of (user_id, countable_declines) for each reviewer
        actually flipped back to active.

        Manual pauses (`paused_reason` not starting with 'auto:') are NOT
        auto-cleared by the sweep — only the admin's explicit `unpause`
        call clears those.
        """
        from ...config import REVIEWER_DECLINE_HARD_LIMIT

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT user_id, paused_reason FROM reviewers WHERE paused_at IS NOT NULL"
            )
            candidates = [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()

        unpaused = []
        now = datetime.now(timezone.utc)
        now_str = now.strftime('%Y-%m-%d %H:%M:%S')

        for cand in candidates:
            user_id = cand['user_id']
            reason = cand.get('paused_reason') or ''
            # Manual pauses are sticky until an admin explicitly unpauses.
            if not reason.startswith('auto:'):
                continue
            counts = Reviewer._aggregate_assignment_counts(user_id)
            if counts['countable_declines'] >= REVIEWER_DECLINE_HARD_LIMIT:
                # Still above threshold — keep paused.
                continue

            inner = get_db_connection()
            try:
                inner.execute('BEGIN IMMEDIATE')
                cur = inner.cursor()
                cur.execute(
                    '''
                    UPDATE reviewers SET
                        paused_at          = NULL,
                        paused_by          = NULL,
                        paused_reason      = NULL,
                        paused_until       = NULL,
                        last_pause_eval_at = ?
                    WHERE user_id = ? AND paused_at IS NOT NULL
                    ''',
                    (now_str, user_id),
                )
                cur.execute(
                    "UPDATE users SET status = 'active' WHERE id = ? AND status = 'paused'",
                    (user_id,),
                )
                inner.commit()
                if cur.rowcount or True:
                    unpaused.append((user_id, counts['countable_declines']))
            except Exception:
                inner.rollback()
            finally:
                inner.close()

        # Post-commit: best-effort reviewer-side notification.
        for user_id, countable in unpaused:
            try:
                Notification.create(
                    user_id,
                    'Reviewer account reactivated',
                    (
                        'Your reviewer account is active again \u2014 your '
                        'countable decline count has dropped below the '
                        f'threshold (now {countable}). You will start '
                        'receiving new assignments again.'
                    ),
                    type='info',
                )
            except Exception:
                pass

        return unpaused

    @staticmethod
    def pause(user_id, admin_id, reason=None):
        """Admin manual pause for a reviewer.

        Sets `paused_at`/`paused_by`/`paused_reason` on `reviewers`, flips
        `users.status` to `'paused'`, and writes a `Notification` for the
        reviewer. Refuses to pause a revoked reviewer or an admin user.

        Idempotent: pausing an already-paused reviewer is a no-op (returns
        the current paused state). The lazy auto-unpause sweep ignores
        manual pauses (`paused_reason` does not start with `'auto:'`).
        """
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('SELECT id, role, status FROM users WHERE id = ?', (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                raise ValueError('User not found')
            user_row = dict(user_row)
            if user_row['role'] == 'admin':
                raise ValueError('Cannot pause an admin user')

            cursor.execute(
                'SELECT user_id, revoked_at, paused_at FROM reviewers WHERE user_id = ?',
                (user_id,),
            )
            rev_row = cursor.fetchone()
            if not rev_row:
                raise ValueError('Reviewer record not found')
            rev_row = dict(rev_row)
            if rev_row.get('revoked_at'):
                raise ValueError('Cannot pause a revoked reviewer')
            if rev_row.get('paused_at'):
                return {'status': 'already_paused', 'user_id': user_id}

            now = datetime.now(timezone.utc)
            now_str = now.strftime('%Y-%m-%d %H:%M:%S')
            stored_reason = (reason or '').strip() or 'manual:admin_paused'

            conn.execute('BEGIN IMMEDIATE')
            cursor.execute(
                '''
                UPDATE reviewers SET
                    paused_at          = ?,
                    paused_by          = ?,
                    paused_reason      = ?,
                    paused_until       = NULL,
                    last_pause_eval_at = ?
                WHERE user_id = ?
                ''',
                (now_str, admin_id, stored_reason, now_str, user_id),
            )
            cursor.execute(
                "UPDATE users SET status = 'paused' WHERE id = ? AND status = 'active'",
                (user_id,),
            )
            conn.commit()
        finally:
            conn.close()

        try:
            Notification.create(
                user_id,
                'Reviewer account paused',
                (
                    'An administrator has paused your reviewer account. '
                    'You will not receive new assignments until you are '
                    'unpaused.'
                    + (f' Reason: {reason}' if reason else '')
                ),
                type='warning',
            )
        except Exception:
            pass

        return {'status': 'paused', 'user_id': user_id, 'paused_by': admin_id,
                'paused_reason': stored_reason}

    @staticmethod
    def unpause(user_id, admin_id):
        """Admin manual unpause for a reviewer.

        Clears `paused_at`/`paused_by`/`paused_reason`/`paused_until` and
        flips `users.status` back to `'active'`. Writes a notification.

        Idempotent: unpausing an active reviewer is a no-op (returns the
        current state).
        """
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT user_id, paused_at FROM reviewers WHERE user_id = ?',
                (user_id,),
            )
            rev_row = cursor.fetchone()
            if not rev_row:
                raise ValueError('Reviewer record not found')
            rev_row = dict(rev_row)
            if not rev_row.get('paused_at'):
                return {'status': 'already_active', 'user_id': user_id}

            now = datetime.now(timezone.utc)
            now_str = now.strftime('%Y-%m-%d %H:%M:%S')

            conn.execute('BEGIN IMMEDIATE')
            cursor.execute(
                '''
                UPDATE reviewers SET
                    paused_at          = NULL,
                    paused_by          = NULL,
                    paused_reason      = NULL,
                    paused_until       = NULL,
                    last_pause_eval_at = ?
                WHERE user_id = ?
                ''',
                (now_str, user_id),
            )
            cursor.execute(
                "UPDATE users SET status = 'active' WHERE id = ? AND status = 'paused'",
                (user_id,),
            )
            conn.commit()
        finally:
            conn.close()

        try:
            Notification.create(
                user_id,
                'Reviewer account reactivated',
                (
                    'An administrator has reactivated your reviewer account. '
                    'You will start receiving new assignments again.'
                ),
                type='info',
            )
        except Exception:
            pass

        return {'status': 'active', 'user_id': user_id, 'unpaused_by': admin_id}


class ReviewerInvite:
    @staticmethod
    def _parse_db_timestamp(ts):
        if not ts:
            return None
        try:
            dt = datetime.fromisoformat(str(ts).replace(' ', 'T').rstrip('Z'))
        except (ValueError, TypeError):
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    @staticmethod
    def _extract_domain(email):
        if not email or '@' not in email:
            return None
        return email.split('@', 1)[1].strip().lower() or None

    @staticmethod
    def _resolve_institution(email):
        from ...config import ALLOWED_INSTITUTION_DOMAINS
        email_lower = (email or '').lower()
        for name, domain in ALLOWED_INSTITUTION_DOMAINS:
            if email_lower.endswith('@' + domain) or email_lower.endswith('.' + domain):
                return domain, name
        return None, None

    @staticmethod
    def _check_cooldown(last_sent_at, now):
        from ...config import REVIEWER_INVITE_RESEND_COOLDOWN_SECONDS
        last_sent = ReviewerInvite._parse_db_timestamp(last_sent_at)
        if last_sent is None:
            return
        elapsed = (now - last_sent).total_seconds()
        if elapsed < REVIEWER_INVITE_RESEND_COOLDOWN_SECONDS:
            retry_after = int(REVIEWER_INVITE_RESEND_COOLDOWN_SECONDS - elapsed) + 1
            err = ValueError(
                f"Please wait {retry_after} seconds before sending another invite."
            )
            err.args = (err.args[0], {'retry_after': retry_after, 'reason': 'cooldown'})
            raise err

    @staticmethod
    def create(submission_id, institutional_email, invited_by=None, force_allowlist=False):
        """Create or refresh an invite for a submission + institutional email."""
        from ..utils.invite_tokens import generate_token, new_expiry

        email = (institutional_email or '').strip().lower()
        if not email or '@' not in email:
            raise ValueError('invalid_email')

        domain, name = ReviewerInvite._resolve_institution(email)
        if not domain and not force_allowlist:
            raise ValueError('invalid_domain')
        if not domain:
            domain = ReviewerInvite._extract_domain(email)

        conn = get_db_connection()
        now = datetime.now(timezone.utc)
        now_str = now.strftime('%Y-%m-%d %H:%M:%S')
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()

            row = cursor.execute(
                'SELECT review_status FROM submissions WHERE id = ?',
                (submission_id,),
            ).fetchone()
            if not row:
                raise ValueError('submission_not_found')
            status = row['review_status']
            if status is None:
                raise ValueError('no_review_request')
            if status in ('approved', 'rejected', 'awaiting_admin'):
                raise ValueError('submission_finalized')

            existing = cursor.execute(
                '''
                SELECT id, send_count, last_sent_at
                FROM reviewer_invites
                WHERE submission_id = ? AND institutional_email = ?
                ''',
                (submission_id, email),
            ).fetchone()

            if existing:
                ReviewerInvite._check_cooldown(existing['last_sent_at'], now)

            raw_token, token_hash = generate_token()
            expires_at = new_expiry()
            send_count = (existing['send_count'] if existing else 0) + 1

            if existing:
                cursor.execute(
                    '''
                    UPDATE reviewer_invites SET
                        token_hash       = ?,
                        status           = 'pending',
                        expires_at       = ?,
                        sent_at          = ?,
                        consumed_at      = NULL,
                        consumed_by      = NULL,
                        invited_by       = ?,
                        send_count       = ?,
                        last_sent_at     = ?,
                        last_notified_at = ?,
                        institution_domain = ?,
                        institution_name   = ?
                    WHERE id = ?
                    ''',
                    (
                        token_hash,
                        expires_at,
                        now_str,
                        invited_by,
                        send_count,
                        now_str,
                        now_str,
                        domain,
                        name,
                        existing['id'],
                    ),
                )
                invite_id = existing['id']
            else:
                cursor.execute(
                    '''
                    INSERT INTO reviewer_invites (
                        submission_id, institutional_email, token_hash, status,
                        expires_at, sent_at, invited_by, send_count, last_sent_at,
                        last_notified_at, institution_domain, institution_name
                    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        submission_id,
                        email,
                        token_hash,
                        expires_at,
                        now_str,
                        invited_by,
                        send_count,
                        now_str,
                        now_str,
                        domain,
                        name,
                    ),
                )
                invite_id = cursor.lastrowid

            conn.commit()
            return {
                'invite_id': invite_id,
                'raw_token': raw_token,
                'institutional_email': email,
                'institution_domain': domain,
                'institution_name': name,
                'expires_at': expires_at,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def resend(invite_id, invited_by=None):
        """Re-issue a fresh invite token for an existing pending invite."""
        from ..utils.invite_tokens import generate_token, new_expiry

        conn = get_db_connection()
        now = datetime.now(timezone.utc)
        now_str = now.strftime('%Y-%m-%d %H:%M:%S')
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            row = cursor.execute(
                '''
                SELECT id, institutional_email, status, send_count, last_sent_at
                FROM reviewer_invites WHERE id = ?
                ''',
                (invite_id,),
            ).fetchone()
            if not row:
                raise ValueError('not_found')
            if row['status'] != 'pending':
                raise ValueError('not_pending')

            ReviewerInvite._check_cooldown(row['last_sent_at'], now)

            raw_token, token_hash = generate_token()
            expires_at = new_expiry()
            send_count = (row['send_count'] or 0) + 1
            cursor.execute(
                '''
                UPDATE reviewer_invites SET
                    token_hash       = ?,
                    expires_at       = ?,
                    sent_at          = ?,
                    invited_by       = ?,
                    send_count       = ?,
                    last_sent_at     = ?,
                    last_notified_at = ?
                WHERE id = ?
                ''',
                (
                    token_hash,
                    expires_at,
                    now_str,
                    invited_by,
                    send_count,
                    now_str,
                    now_str,
                    invite_id,
                ),
            )
            conn.commit()
            return {
                'invite_id': invite_id,
                'raw_token': raw_token,
                'institutional_email': row['institutional_email'],
                'expires_at': expires_at,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def get_by_token(raw_token):
        from ..utils.invite_tokens import hash_token, is_expired

        token_hash = hash_token(raw_token)
        consumed_hash = f'consumed:{token_hash}'
        expired_hash = f'expired:{token_hash}'
        revoked_hash = f'revoked:{token_hash}'
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            row = cursor.execute(
                '''
                SELECT *
                FROM reviewer_invites
                WHERE token_hash IN (?, ?, ?, ?)
                ORDER BY CASE token_hash
                    WHEN ? THEN 0
                    WHEN ? THEN 1
                    WHEN ? THEN 2
                    WHEN ? THEN 3
                    ELSE 4
                END
                LIMIT 1
                ''',
                (
                    token_hash,
                    consumed_hash,
                    expired_hash,
                    revoked_hash,
                    token_hash,
                    consumed_hash,
                    expired_hash,
                    revoked_hash,
                ),
            ).fetchone()
            if not row:
                raise ValueError('invalid')
            row = dict(row)
            if row.get('status') == 'consumed':
                raise ValueError('consumed')
            if row.get('status') == 'expired':
                raise ValueError('expired')
            if row.get('status') != 'pending':
                raise ValueError('not_pending')
            if is_expired(row.get('expires_at')):
                cursor.execute(
                    '''
                    UPDATE reviewer_invites
                    SET status = 'expired', token_hash = 'expired:' || token_hash
                    WHERE id = ?
                    ''',
                    (row['id'],),
                )
                conn.commit()
                raise ValueError('expired')
            return row
        finally:
            conn.close()

    @staticmethod
    def get_consumed_by_token(raw_token):
        from ..utils.invite_tokens import hash_token

        token_hash = f"consumed:{hash_token(raw_token)}"
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            row = cursor.execute(
                '''
                SELECT * FROM reviewer_invites
                WHERE token_hash = ? AND status = 'consumed'
                ''',
                (token_hash,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    @staticmethod
    def get_latest_consumed_by_user(user_id, institutional_email=None):
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            if institutional_email:
                row = cursor.execute(
                    '''
                    SELECT *
                    FROM reviewer_invites
                    WHERE status = 'consumed'
                      AND consumed_by = ?
                      AND lower(trim(institutional_email)) = lower(trim(?))
                    ORDER BY COALESCE(consumed_at, created_at) DESC, id DESC
                    LIMIT 1
                    ''',
                    (user_id, institutional_email),
                ).fetchone()
                if row:
                    return dict(row)

            row = cursor.execute(
                '''
                SELECT *
                FROM reviewer_invites
                WHERE status = 'consumed' AND consumed_by = ?
                ORDER BY COALESCE(consumed_at, created_at) DESC, id DESC
                LIMIT 1
                ''',
                (user_id,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    @staticmethod
    def mark_consumed(invite_id, user_id):
        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE reviewer_invites
                SET status = 'consumed',
                    consumed_at = CURRENT_TIMESTAMP,
                    consumed_by = ?,
                    token_hash = 'consumed:' || token_hash
                WHERE id = ?
                ''',
                (user_id, invite_id),
            )
            conn.commit()
            return True
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def revoke(invite_id):
        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE reviewer_invites
                SET status = 'revoked',
                    token_hash = 'revoked:' || token_hash
                WHERE id = ?
                ''',
                (invite_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def revoke_pending_by_submission(submission_id):
        conn = get_db_connection()
        try:
            conn.execute('BEGIN IMMEDIATE')
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE reviewer_invites
                SET status = 'revoked',
                    token_hash = 'revoked:' || token_hash
                WHERE submission_id = ? AND status = 'pending'
                ''',
                (submission_id,),
            )
            conn.commit()
            return cursor.rowcount
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def list_by_submission(submission_id):
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT id, submission_id, institutional_email, status,
                       strftime('%Y-%m-%dT%H:%M:%SZ', expires_at) as expires_at,
                       strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
                       strftime('%Y-%m-%dT%H:%M:%SZ', sent_at) as sent_at,
                       strftime('%Y-%m-%dT%H:%M:%SZ', consumed_at) as consumed_at,
                       invited_by, consumed_by, send_count,
                       strftime('%Y-%m-%dT%H:%M:%SZ', last_sent_at) as last_sent_at,
                       strftime('%Y-%m-%dT%H:%M:%SZ', last_notified_at) as last_notified_at,
                       institution_domain, institution_name
                FROM reviewer_invites
                WHERE submission_id = ?
                ORDER BY created_at DESC
                ''',
                (submission_id,),
            )
            return [dict(r) for r in cursor.fetchall()]
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
