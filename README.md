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

## Installation & Setup

### ⚠️ Important Note for Team Members
**DO NOT use `npm install`** for this project. Always use `npm ci` instead. This ensures everyone has the exact same dependency versions from `package-lock.json`, preventing "works on my machine" issues.

### Quick Setup (Automated - Recommended)

**Windows:**
```bash
setup.ps1
```
#### What the Setup Scripts Do:
- ✅ Check if backend/frontend servers are running and warn you
- ✅ Skip steps that are already done (venv, dependencies)
- ✅ Ask before reinitializing the database if it exists
- ✅ Install all dependencies automatically
- ✅ Print clear instructions for starting servers

**Safe to run multiple times!** The scripts are idempotent and won't overwrite existing data.

Then follow the printed instructions to start the servers.

---

### Manual Setup

#### Backend Setup

1. From the project root, enter the backend folder:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# OR macOS/Linux
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Initialize the database:
```bash
python init_db.py
```

5. Start the Flask server (from project root):
```bash
python backend/run.py
```

Backend runs on `http://localhost:5000`

#### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm ci  # [DO NOT USE: npm install - use 'npm ci' for reproducible installs]
```

3. Start the development server:
```bash
npm start
```

Frontend runs on `http://localhost:3000`

## Usage

1. **Register/Login**: Create an account or login to access the platform (a default admin user, username/password = `admin`/`admin` is created)
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

## License

This project is for educational purposes.
