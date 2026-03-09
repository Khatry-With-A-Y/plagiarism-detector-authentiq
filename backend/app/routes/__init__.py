# route blueprints package
from .auth import auth_bp
from .papers import papers_bp

__all__ = ["auth_bp", "papers_bp"]