import sqlite3
import os
import sys
from pathlib import Path

# Add project root to sys.path so backend imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import DATABASE_PATH

def wipe_submissions():
    """
    Clears all submission data and similarity results to reset admin dashboard metrics
    while preserving the research paper corpus.
    """
    print(f"Connecting to database at {DATABASE_PATH}...")
    if not os.path.exists(DATABASE_PATH):
        print(f"Error: Database file not found at {DATABASE_PATH}")
        return

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    try:
        # 1. Delete similarity results
        print("Deleting similarity results...")
        cursor.execute("DELETE FROM similarity_results")
        
        # 2. Delete submissions
        # Note: Foreign keys (like reviewer_invites) should be handled by ON DELETE CASCADE 
        # if the schema supports it, but clearing submissions is the primary goal.
        print("Deleting submissions...")
        cursor.execute("DELETE FROM submissions")
        
        # 3. Reset auto-increment counters to start new uploads from ID 1
        print("Resetting auto-increment counters...")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('submissions', 'similarity_results')")
        
        conn.commit()
        print("Successfully wiped submissions and similarity results.")
        print("Admin dashboard metrics (processing time, reports, etc.) have been reset.")
        
    except Exception as e:
        conn.rollback()
        print(f"Error occurred during wipe: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    wipe_submissions()
