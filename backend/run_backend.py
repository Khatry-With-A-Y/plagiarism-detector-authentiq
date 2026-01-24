#!/usr/bin/env python
"""Run the Flask backend server"""
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.app import app

if __name__ == '__main__':
    print("Starting Authentiq backend server...")
    print("Backend API: http://localhost:5000")
    app.run(debug=True, port=5000)
