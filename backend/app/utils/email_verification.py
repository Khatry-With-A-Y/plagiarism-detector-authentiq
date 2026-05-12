"""Token utilities for institutional-email verification (reviewer role).

Pure-Python helpers used by `Reviewer.apply` (issuance) and
`Reviewer.consume_email_verification` (consumption). Only the SHA-256
hash of a token is ever persisted; the raw token leaves the backend
exactly once, embedded in the verification email link.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

# 24-hour window: matches the value advertised in the verification email.
TOKEN_TTL = timedelta(hours=24)


def generate_token():
    """Return (raw_token, sha256_hex). Raw token is URL-safe, ~256 bits."""
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode('utf-8')).hexdigest()


def hash_token(raw):
    """Return the SHA-256 hex digest of a raw token (used for lookup)."""
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def new_expiry():
    """Return a fresh expiry timestamp (UTC, 24h ahead) as 'YYYY-MM-DD HH:MM:SS'."""
    return (datetime.now(timezone.utc) + TOKEN_TTL).strftime('%Y-%m-%d %H:%M:%S')


def is_expired(expires_at_str):
    """Return True iff `expires_at_str` is missing or already in the past (UTC)."""
    if not expires_at_str:
        return True
    # Accept both 'YYYY-MM-DD HH:MM:SS' (sqlite TIMESTAMP) and ISO 'T' form.
    try:
        exp = datetime.fromisoformat(expires_at_str.replace(' ', 'T'))
    except ValueError:
        return True
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)
