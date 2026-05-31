from flask import Flask, send_from_directory
from flask_cors import CORS

from .. import config
from ..config import CORS_ORIGINS, UPLOAD_FOLDER, CORPUS_FOLDER, DATA_DIR
from .utils.database import init_database
from .utils.text_processing import preload_wordnet

# import blueprints
from .routes.auth import auth_bp
from .routes.papers import papers_bp
from .routes.reviewers import reviewers_bp
from .routes.reviews import reviews_bp
from .routes.notifications import notifications_bp

AVATARS_DIR = DATA_DIR / 'avatars'


def create_app():
    """Flask application factory"""
    app = Flask(__name__)
    # apply config from config.py
    app.config.from_object(config)

    # enable CORS
    CORS(app, origins=CORS_ORIGINS)

    # ensure required directories exist
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    CORPUS_FOLDER.mkdir(parents=True, exist_ok=True)
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)

    init_database()
    preload_wordnet()

    # register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(papers_bp)
    app.register_blueprint(reviewers_bp)
    app.register_blueprint(reviews_bp, url_prefix='/api/reviews')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')

    # serve uploaded avatar images
    @app.route('/api/avatars/<path:filename>')
    def serve_avatar(filename):
        return send_from_directory(str(AVATARS_DIR), filename)

    return app