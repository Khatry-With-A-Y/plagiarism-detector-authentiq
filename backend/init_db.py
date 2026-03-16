"""Initialize the database"""
import sys
from pathlib import Path

# Ensure parent directory is on sys.path so imports like `backend.app` work
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.utils.database import init_database

if __name__ == '__main__':
    init_database()
    print("Database initialized successfully!")
