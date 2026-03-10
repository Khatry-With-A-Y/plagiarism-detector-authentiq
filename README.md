# Authentiq: An N-Gram Enhanced Plagiarism Detection System for Academic Papers

Authentiq is a full-stack web application for detecting plagiarism in academic papers. It uses TF-IDF (Term Frequency-Inverse Document Frequency) algorithm combined with cosine similarity to compare submitted documents against a corpus of academic papers.

## Features

- **File Upload Support**: Accepts .pdf, .doc, and .docx files
- **TF-IDF Analysis**: Uses advanced text processing and TF-IDF vectorization
- **Cosine Similarity**: Calculates similarity scores between documents
- **Submission Management**: Track and manage your document submissions
- **Results Display**: View ranked similarity results with detailed information
- **Admin Panel**: Manage the academic paper corpus (admin users)
- **Corpus Management**: Add papers to the corpus for comparison

## Technology Stack

### Backend
- **Python 3.x**
- **Flask** - Web framework
- **SQLite** - Database
- **PyJWT** - JWT authentication
- **python-docx** - DOCX file processing
- **PyPDF2/pdfplumber** - PDF file processing
- **python-docx2txt** - DOC file processing

### Frontend
- **React 18** - UI framework
- **React Router** - Routing

## Project Structure

```
plagiarism-detector-authentiq/
├── backend/
│   ├── run.py                 # entry point for starting Flask
│   ├── config.py              # configuration settings
│   ├── requirements.txt       # backend Python dependencies
│   │
│   ├── app/                   # application package
│   │   ├── __init__.py        # app factory and blueprint registration
│   │   ├── models/            # database model classes
│   │   │   └── models.py
│   │   ├── routes/            # flask blueprints for API endpoints
│   │   │   ├── auth.py
│   │   │   └── papers.py
│   │   └── utils/             # helper modules
│   │       ├── database.py
│   │       ├── file_processor.py
│   │       ├── text_processing.py
│   │       ├── tfidf.py
│   │       └── cosine.py
│   │
│   └── data/                  # persistent storage
│       ├── raw_papers/        # corpus files
│       ├── processed/         # uploaded submissions
│       └── database.db        # sqlite database file
├── frontend/                 # React frontend
│   ├── package.json
│   └── src/
│       ├── api/
│       │   ├── api.js
│       │   ├── auth.js
│       │   └── results.js
│       ├── components/
│       │   └── ResultCard.jsx
│       ├── hooks/
│       │   ├── useAuth.js
│       │   └── useFetchResults.js
│       ├── pages/
│       │   ├── AdminPanel.jsx
│       │   ├── Dashboard.jsx
│       │   ├── FileUpload.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   └── ResultsDisplay.jsx
│       ├── utils/
│       │   └── auth.js
│       ├── App.jsx
│       ├── index.css
│       └── index.js
└── README.md
```

## Installation & Setup

### Backend Setup

1. From the project root, enter the backend folder (optional):
```bash
cd backend
```

2. Create and activate a virtual environment (recommended):
```bash
python -m venv venv
# Windows
venv\Scripts\activate
``` 

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Initialize the database (database file will be created under `backend/data`):
```bash
python - <<'PY'
from backend.app.utils.database import init_database
init_database()
PY
```

5. Start the Flask server (from project root):
```bash
python backend/run.py
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## Usage

1. **Register/Login**: Create an account or login to access the platform
2. **Upload Document**: Upload your academic paper (.pdf, .doc, .docx)
3. **Automatic Analysis**: The system automatically processes your document against the corpus
4. **View Results**: See ranked similarity results with scores and paper details
5. **Admin Features**: Admin users can manage the corpus by adding/removing papers

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### Submissions
- `POST /api/submissions/upload` - Upload file for analysis
- `GET /api/submissions` - Get user's submission history
- `GET /api/submissions/:id/results` - Get similarity results
- `POST /api/process/:id` - Trigger processing

### Corpus Management (Admin)
- `POST /api/corpus/upload` - Add paper to corpus
- `GET /api/corpus` - List all papers
- `DELETE /api/corpus/:id` - Remove paper from corpus

## Configuration

Edit `backend/config.py` to customize:
- Database path
- File upload limits
- JWT secret key (change in production!)
- CORS origins
- Allowed file extensions

## Security Notes

- Change `JWT_SECRET_KEY` and `SECRET_KEY` in production
- Use environment variables for sensitive configuration
- Implement rate limiting for production use
- Add file virus scanning for production
- Use HTTPS in production

## Development

### Creating an Admin User

To create an admin user, you can modify the database directly or add a script:

```python
from backend.app.models.models import User
from backend.app.utils.auth import hash_password

User.create(
    username='admin',
    email='admin@example.com',
    password_hash=hash_password('adminpassword'),
    role='admin'
)
```

## License

This project is for educational purposes.
