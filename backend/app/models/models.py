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
                SELECT r.user_id, r.institution_domain, r.expertise_tags,
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
                  AND u.status != 'blocked'
            ''')
            all_reviewers = [dict(row) for row in cursor.fetchall()]

            candidates = []
            conflict_ids = set()

            # Block 7 (Stage 7b): exclusion-counter breakdown for the
            # `insufficient_pool` diagnostic. Counts are mutually exclusive in
            # *evaluation order* (submitter beats already_assigned beats
            # expertise beats institution) — same priority as the filter
            # chain, so the totals always sum to <total_active_reviewers>.
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

            # 4. Quorum check
            # Count active assignments that already exist on this submission
            # (assigned/accepted/voted — exclude declined/expired). When we are
            # backfilling (count < REVIEWERS_PER_REQUEST), a single new pick
            # may be enough if the total active pool >= MIN_REVIEWERS_PER_REQUEST.
            existing_active = sum(
                1 for e in existing_votes
                if e.get('assignment_status') in ('assigned', 'accepted', 'voted')
            )
            total_active_after = existing_active + len(selected)

            if total_active_after < MIN_REVIEWERS_PER_REQUEST:
                # Block 7 (Stage 7b): structured breakdown so the admin queue
                # can explain *why* the pool was short instead of just
                # surfacing the bare badge.
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
    def submit_vote(submission_id, reviewer_id, vote, comment=None, fail_reasons=None):
        """
        Submit a pass/fail vote for a reviewer's assignment.
        Wrapped in BEGIN IMMEDIATE; re-reads live counts atomically.
        Transitions review_status to 'awaiting_admin' when majority reached.
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

            # Block 5: must accept the assignment before voting.
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
            total_assigned = len([e for e in votes
                                  if e.get('assignment_status') not in ('declined', 'expired')])

            # Majority detection
            majority_threshold = (total_assigned // 2) + 1
            new_status = row['review_status']
            review_outcome = None
            if pass_count >= majority_threshold:
                new_status = 'awaiting_admin'
                review_outcome = 'pass'
            elif fail_count >= majority_threshold:
                new_status = 'awaiting_admin'
                review_outcome = 'fail'
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

    # ------------------------------------------------------------------
    # Block 5 — Assignment Lifecycle: Accept / Decline / Expire + Backfill
    # ------------------------------------------------------------------

    @staticmethod
    def accept_assignment(submission_id, reviewer_id):
        """
        Reviewer transitions their assignment from 'assigned' -> 'accepted'.
        Rejects from any other state with a clear ValueError.
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
    def decline_assignment(submission_id, reviewer_id, decline_reason=None):
        """
        Reviewer transitions their assignment 'assigned'|'accepted' -> 'declined',
        captures an optional decline_reason (<= DECLINE_REASON_MAX_LEN), then
        synchronously calls assign_many(submission_id, 1) to backfill the slot
        from the remaining eligible pool.
        """
        from ...config import DECLINE_REASON_MAX_LEN
        from datetime import datetime, timezone

        if decline_reason is not None:
            decline_reason = (decline_reason or '').strip()
            if len(decline_reason) > DECLINE_REASON_MAX_LEN:
                raise ValueError(
                    f'decline_reason exceeds {DECLINE_REASON_MAX_LEN} characters'
                )

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
            if current_status not in ('assigned', 'accepted'):
                raise ValueError(
                    f"Cannot decline from status '{current_status}'"
                )

            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            entry['assignment_status'] = 'declined'
            entry['declined_at'] = now_str
            entry['decline_reason'] = decline_reason or None
            votes[entry_idx] = entry

            cursor.execute(
                'UPDATE submissions SET review_votes = ? WHERE id = ?',
                (json.dumps(votes), submission_id)
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        # Synchronously backfill from the remaining pool. assign_many opens its
        # own connection and excludes anyone already in review_votes (including
        # the just-declined reviewer), so duplicates are impossible.
        backfill = Submission.assign_many(submission_id, count=1)
        return {
            'assignment_status': 'declined',
            'backfill': backfill,
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
                  before quorum (review_status not in awaiting_admin / under_review).
        title   : (approve only) admin-supplied paper title for the new
                  papers row.
        author  : (approve only) admin-supplied author name.
        force   : (approve only) bypass DUPLICATE_PAPER guard.

        Returns dict:
          - on approve: { decision, review_status='approved', paper_id,
                          content_hash }
          - on reject : { decision, review_status='rejected' }

        Raises ValueError with one of:
          'INVALID_DECISION'             — decision not in approve/reject
          'SUBMISSION_NOT_FOUND'
          'NO_REVIEW_REQUEST'            — submission has no review_status set
          'ALREADY_DECIDED'              — already approved/rejected
          'OVERRIDE_REASON_REQUIRED'     — overriding pre-quorum without reason
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

            # 'awaiting_admin' is the canonical post-quorum state. Anything
            # else (pending / assigned / under_review / insufficient_pool)
            # means admin is overriding before the panel reached majority,
            # which the plan requires to carry an explicit reason.
            is_pre_quorum_override = current_status != 'awaiting_admin'
            if is_pre_quorum_override and not (reason and reason.strip()):
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

            # ---- Persist the audit fields + final review_status. ----
            new_status = 'approved' if decision == 'approve' else 'rejected'
            try:
                cursor.execute('BEGIN IMMEDIATE')
                cursor.execute(
                    '''
                    UPDATE submissions
                       SET review_status         = ?,
                           admin_decision        = ?,
                           admin_decided_by      = ?,
                           admin_decided_at      = CURRENT_TIMESTAMP,
                           admin_decision_reason = ?
                     WHERE id = ?
                    ''',
                    (new_status, new_status, admin_id,
                     (reason or None), submission_id),
                )
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                raise

            response = {
                'decision':        decision,
                'review_status':   new_status,
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
            cursor.execute(
                "SELECT institutional_email, email_verified FROM reviewers WHERE user_id = ?",
                (user_id,)
            )
            prev = cursor.fetchone()
            same_email = bool(
                prev
                and (prev['institutional_email'] or '').lower() == (institutional_email or '').lower()
            )
            already_verified = bool(prev and prev['email_verified'] and same_email)

            raw_token = None
            token_hash = None
            expires_at = None
            if not already_verified:
                raw_token, token_hash = generate_token()
                expires_at = new_expiry()

            expertise_tags_json = json.dumps(expertise_tags)
            cursor.execute('''
                INSERT INTO reviewers (user_id, institution_domain, institution_name, affiliation,
                                     institutional_email, bio, expertise_tags, application_status, submitted_at,
                                     email_verified, email_verification_token_hash, email_verification_expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP,
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
                    email_verification_expires_at    = excluded.email_verification_expires_at
            ''', (
                user_id, institution_domain, institution_name, affiliation,
                institutional_email, bio, expertise_tags_json,
                1 if already_verified else 0, token_hash, expires_at,
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

        Block 7 (Stage 7c): adds a synthetic ``status='revoked'`` filter.

        ``revoke`` flips ``application_status`` from ``'approved'`` to
        ``'rejected'`` AND stamps ``revoked_at``. Without special handling the
        plain ``'rejected'`` filter would mix two distinct populations:
        applicants the admin rejected and ex-reviewers who got revoked. So:

        - ``status='revoked'``  → ``revoked_at IS NOT NULL`` (regardless of
          ``application_status``, which is always ``'rejected'`` for these
          rows but kept defensively in case the policy changes).
        - ``status='rejected'`` → ``application_status='rejected' AND
          revoked_at IS NULL`` (pure rejections only).
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