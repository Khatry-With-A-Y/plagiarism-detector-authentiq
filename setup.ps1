# Setup script for Authentiq - PowerShell

# ── Corpus Download Configuration ─────────────────────────────────
# To update: zip the corpus PDFs, create/update a GitHub release, and upload the zip.
# Release: https://github.com/Khatry-With-A-Y/plagiarism-detector-authentiq/releases/tag/Authentiq-Raw-PDFs
$CORPUS_URL = "https://github.com/Khatry-With-A-Y/plagiarism-detector-authentiq/releases/download/Authentiq-Raw-PDFs/Authentiq-Raw-PDFs.zip"
# ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Authentiq Project Setup (PowerShell)" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "[OK] Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.x from https://www.python.org"
    exit 1
}

# Check if Node/npm is installed
try {
    $npmVersion = npm --version 2>&1
    Write-Host "[OK] npm found: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js/npm is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org"
    exit 1
}

Write-Host ""

# Check if backend is running
$backendRunning = $null -ne (netstat -ano 2>$null | Select-String ":5000.*LISTEN")
if ($backendRunning) {
    Write-Host "WARNING: Backend appears to be running on http://localhost:5000" -ForegroundColor Yellow
    Write-Host "Please stop the backend before running setup (Ctrl+C in backend terminal)"
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 0
    }
}

# Check if frontend is running
$frontendRunning = $null -ne (netstat -ano 2>$null | Select-String ":3000.*LISTEN") 
if ($frontendRunning) {
    Write-Host "WARNING: Frontend appears to be running on http://localhost:3000" -ForegroundColor Yellow
    Write-Host "Please stop the frontend before running setup (Ctrl+C in frontend terminal)"
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 0
    }
}

Write-Host ""

# Backend setup
Push-Location backend

# Check if venv already exists
if (Test-Path venv) {
    Write-Host "[1/6] Virtual environment already exists, skipping creation" -ForegroundColor Cyan
} else {
    Write-Host "[1/6] Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[2/6] Activating virtual environment..." -ForegroundColor Cyan
& ".\venv\Scripts\Activate.ps1"

Write-Host "[3/6] Installing/updating backend dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# ── Step 3.5: Verify vendored NLTK data is present ───────────────
# WordNet + OMW-1.4 are committed to git under backend/data/nltk_data/
# so the backend never has to call nltk.download(...) at runtime.
# This is a pure file-existence check — no network call.
$nltkOk = (Test-Path 'data\nltk_data\corpora\wordnet.zip') -and `
          (Test-Path 'data\nltk_data\corpora\omw-1.4.zip')
if (-not $nltkOk) {
    Write-Host "[ERROR] Vendored NLTK data is missing under backend\data\nltk_data\corpora\." -ForegroundColor Red
    Write-Host "        Expected files: wordnet.zip and omw-1.4.zip" -ForegroundColor Yellow
    Write-Host "        Run: git checkout -- backend/data/nltk_data   (or re-clone the repo)" -ForegroundColor Yellow
    exit 1
}
Write-Host "[3.5/6] Vendored NLTK data verified" -ForegroundColor Cyan

# ── Step 4: Download corpus PDFs from GitHub Release ─────────────
$pdfCount = (Get-ChildItem "data\raw_papers\*.pdf" -ErrorAction SilentlyContinue | Measure-Object).Count

if ($pdfCount -ge 300) {
    Write-Host "[4/6] Corpus already present ($pdfCount PDFs found)" -ForegroundColor Cyan
} else {
    Write-Host "[4/6] Downloading corpus PDFs from GitHub Release..." -ForegroundColor Cyan
    Write-Host "  This may take several minutes (~1.2 GB)..." -ForegroundColor Gray

    $zipPath = "data\raw_papers\corpus.zip"

    # Ensure directory exists
    if (-not (Test-Path "data\raw_papers")) {
        New-Item -ItemType Directory -Path "data\raw_papers" -Force | Out-Null
    }

    try {
        curl.exe -L -o $zipPath $CORPUS_URL

        # Extract and clean up
        Write-Host "  Extracting PDFs..." -ForegroundColor Gray
        Expand-Archive -Path $zipPath -DestinationPath "data\raw_papers" -Force
        Remove-Item $zipPath -Force

        $newPdfCount = (Get-ChildItem "data\raw_papers\*.pdf" -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  Extracted $newPdfCount PDFs" -ForegroundColor Green

    } catch {
        Write-Host "[WARNING] Corpus download failed: $_" -ForegroundColor Yellow
        Write-Host "  You can download the corpus manually later (see README)" -ForegroundColor Yellow
        # Clean up partial zip if it exists
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    }
}

# ── Step 5: Database initialization ────────────────────────────────
if (Test-Path "data\database.db") {
    Write-Host "[5/6] Database already exists" -ForegroundColor Cyan
    $reinit = Read-Host "  Reinitialize database? (y/n)"
    if ($reinit -eq "y" -or $reinit -eq "Y") {
        # Clean up database and sidecar files for a fresh start
        Remove-Item "data\database.db" -ErrorAction SilentlyContinue
        Remove-Item "data\database.db-shm" -ErrorAction SilentlyContinue
        Remove-Item "data\database.db-wal" -ErrorAction SilentlyContinue
        
        python init_db.py
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to initialize database" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "[5/6] Initializing database..." -ForegroundColor Cyan
    python init_db.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to initialize database" -ForegroundColor Red
        exit 1
    }
}

# ── Step 5.5: Ingest corpus into database ───────────────────────────
$pdfCount = (Get-ChildItem "data\raw_papers\*.pdf" -ErrorAction SilentlyContinue | Measure-Object).Count

if ($pdfCount -ge 300) {
    Write-Host "[5.5/6] Corpus already ingested ($pdfCount PDFs found)" -ForegroundColor Cyan
    $reingest = Read-Host "  Re-ingest corpus? (y/n)"
    if ($reingest -eq "y" -or $reingest -eq "Y") {
        python app/utils/dataset_builder/ingest_papers.py
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to ingest corpus" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "[5.5/6] Ingesting corpus into database..." -ForegroundColor Cyan
    Write-Host "  This may take several minutes depending on corpus size..." -ForegroundColor Gray
    python app/utils/dataset_builder/ingest_papers.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to ingest corpus" -ForegroundColor Red
        exit 1
    }
}

Pop-Location

# Frontend setup
Push-Location frontend

# Check if node_modules already exists
if (Test-Path node_modules) {
    Write-Host "[6/6] Frontend dependencies already installed" -ForegroundColor Cyan
} else {
    Write-Host "[6/6] Installing frontend dependencies..." -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install npm dependencies" -ForegroundColor Red
        exit 1
    }
}

Pop-Location

# Return to project root
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "Setup completed successfully!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the project:"
Write-Host ""
Write-Host "Terminal 1 - Backend:"
Write-Host "  cd backend"
Write-Host "  .\venv\Scripts\Activate.ps1"
Write-Host "  python run_backend.py"
Write-Host ""
Write-Host "Terminal 2 - Frontend:"
Write-Host "  cd frontend"
Write-Host "  npm start"
Write-Host ""

$pdfCount = (Get-ChildItem "backend\data\raw_papers\*.pdf" -ErrorAction SilentlyContinue | Measure-Object).Count
if ($pdfCount -ge 300) {
    Write-Host "Next step - Ingest corpus into database:" -ForegroundColor Yellow
    Write-Host "  cd backend"
    Write-Host "  .\venv\Scripts\Activate.ps1"
    Write-Host "  python app/utils/dataset_builder/ingest_papers.py"
    Write-Host ""
}

Write-Host "Default login: admin / admin"
Write-Host ""
