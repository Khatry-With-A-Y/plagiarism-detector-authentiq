import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Database configuration
DATABASE_PATH = BASE_DIR / "backend" / "authentiq.db"

# File upload configuration
UPLOAD_FOLDER = BASE_DIR / "backend" / "uploads"
CORPUS_FOLDER = BASE_DIR / "backend" / "corpus"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
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
