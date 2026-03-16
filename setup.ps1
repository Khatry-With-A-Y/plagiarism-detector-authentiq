# Setup script for Authentiq - PowerShell

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
$backendRunning = (netstat -ano 2>$null | Select-String ":5000.*LISTEN") -ne $null
if ($backendRunning) {
    Write-Host "WARNING: Backend appears to be running on http://localhost:5000" -ForegroundColor Yellow
    Write-Host "Please stop the backend before running setup (Ctrl+C in backend terminal)"
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 0
    }
}

# Check if frontend is running
$frontendRunning = (netstat -ano 2>$null | Select-String ":3000.*LISTEN") -ne $null
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
    Write-Host "[1/5] Virtual environment already exists, skipping creation" -ForegroundColor Cyan
} else {
    Write-Host "[1/5] Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[2/5] Activating virtual environment..." -ForegroundColor Cyan
& ".\venv\Scripts\Activate.ps1"

Write-Host "[3/5] Installing/updating backend dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Check if database already exists
if (Test-Path "data\database.db") {
    Write-Host "[4/5] Database already exists" -ForegroundColor Cyan
    $reinit = Read-Host "Reinitialize database? (y/n)"
    if ($reinit -eq "y" -or $reinit -eq "Y") {
        python init_db.py
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to initialize database" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "[4/5] Initializing database..." -ForegroundColor Cyan
    python init_db.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to initialize database" -ForegroundColor Red
        exit 1
    }
}

Pop-Location

# Frontend setup
Push-Location frontend

# Check if node_modules already exists
if (Test-Path node_modules) {
    Write-Host "[5/5] Frontend dependencies already installed" -ForegroundColor Cyan
} else {
    Write-Host "[5/5] Installing frontend dependencies..." -ForegroundColor Cyan
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
Write-Host "  python run.py"
Write-Host ""
Write-Host "Terminal 2 - Frontend:"
Write-Host "  cd frontend"
Write-Host "  npm start"
Write-Host ""
Write-Host "Backend: http://localhost:5000"
Write-Host "Frontend: http://localhost:3000"
Write-Host ""
Write-Host "Default login: admin / admin"
Write-Host ""
