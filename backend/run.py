#!/usr/bin/env python
"""Backend entry point."""
import sys
from pathlib import Path

# ensure project root on sys.path so that imports like `backend.app` work
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.app import create_app

app = create_app()

if __name__ == '__main__':
    print("Starting Authentiq backend server...")
    print("Backend API: http://localhost:5000")
    app.run(debug=True, port=5000) #this has to be configured to serve website WIP
