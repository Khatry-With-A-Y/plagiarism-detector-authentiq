#!/usr/bin/env python
"""Run the Flask backend server"""
import sys
from pathlib import Path

# Add project root (workspace root) to Python path so that
# the `backend` package can be imported when this script is run
# from inside the `backend` directory.
#
# When run_backend.py lives in backend/, we need the *parent* of
# that folder on sys.path, not backend/ itself.  Otherwise
# `import backend.app` will fail with ModuleNotFoundError.
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.app import app

if __name__ == '__main__':
    print("Starting Authentiq backend server...")
    print("Backend API: http://localhost:5000")
    app.run(debug=True, port=5000)
