import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Data directories (contains database, raw/processed papers, etc.)
DATA_DIR = BASE_DIR / "backend" / "data"

# Database configuration
DATABASE_PATH = DATA_DIR / "database.db"

# File upload configuration
# submissions will go into the "processed" folder, corpus papers to "raw_papers"
UPLOAD_FOLDER = DATA_DIR / "processed"
CORPUS_FOLDER = DATA_DIR / "raw_papers"
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
ALLOWED_EXTENSIONS = {'.txt', '.pdf', '.doc', '.docx'}

# JWT configuration
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Flask configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'

# CORS configuration
CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173']  # React dev servers
