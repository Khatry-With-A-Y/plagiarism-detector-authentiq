from flask import Flask
from flask_cors import CORS

from backend.config import CORS_ORIGINS, UPLOAD_FOLDER, CORPUS_FOLDER
from .utils.database import init_database

# import blueprints
from .routes.auth import auth_bp
from .routes.papers import papers_bp


def create_app():
    """Flask application factory"""
    app = Flask(__name__)
    # apply config from config.py
    app.config.from_object('backend.config')

    # enable CORS
    CORS(app, origins=CORS_ORIGINS)

    # ensure required directories exist
    # data directory may be referenced indirectly via UPLOAD_FOLDER/CORPUS_FOLDER
    try:
        from backend.config import DATA_DIR
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except ImportError:
        pass
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    CORPUS_FOLDER.mkdir(parents=True, exist_ok=True)

    # initialize database
    with app.app_context():
        init_database()

    # register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(papers_bp)

    return app