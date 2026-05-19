"""Token utilities for reviewer invitation links.

Only the SHA-256 hash of a token is persisted; the raw token leaves the
backend once, embedded in the invite email link.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from ...config import REVIEWER_INVITE_TTL_HOURS


def generate_token():
    """Return (raw_token, sha256_hex). Raw token is URL-safe, ~256 bits."""
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode('utf-8')).hexdigest()


def hash_token(raw):
    """Return the SHA-256 hex digest of a raw token (used for lookup)."""
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def new_expiry():
    """Return a fresh expiry timestamp (UTC) as 'YYYY-MM-DD HH:MM:SS'."""
    return (
        datetime.now(timezone.utc)
        + timedelta(hours=REVIEWER_INVITE_TTL_HOURS)
    ).strftime('%Y-%m-%d %H:%M:%S')


def is_expired(expires_at_str):
    """Return True iff `expires_at_str` is missing or already in the past (UTC)."""
    if not expires_at_str:
        return True
    try:
        exp = datetime.fromisoformat(expires_at_str.replace(' ', 'T'))
    except ValueError:
        return True
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)
