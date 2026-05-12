"""Brevo (transactional SMTP) mailer for institutional-email verification.

This module sends the reviewer-application verification link via Brevo's
SMTP relay (`smtp-relay.brevo.com:587`). Credentials are read from
environment variables only -- never paste them into this file. See
`backend/.env.example` for the variables you need to set in a local,
untracked `backend/.env` (the existing `.env` rule in `.gitignore`
keeps it out of git).

DELIVERY MODES
--------------
1) Dev-dump: if `MAIL_DEV_DUMP="1"` (in-file constant or env var) OR the
   SMTP key is empty, the verification link is printed to the backend
   terminal. A fresh machine with no `backend/.env` therefore still
   works -- it just dumps the link to stdout instead of sending mail.

2) Real send via Brevo (default for this repo): with the in-file
   `MAIL_DEV_DUMP` constant set to "0" and `BREVO_LOGIN`,
   `BREVO_SMTP_KEY`, `BREVO_SENDER` set in the environment (typically
   via `backend/.env`), the link is sent through Brevo's SMTP relay.
   Setting the `MAIL_DEV_DUMP` environment variable always overrides
   the in-file constant, so you can switch back to dev-dump without
   editing code.

WHAT YOU NEED FROM BREVO
------------------------
- Sign in: https://app.brevo.com
- Left sidebar -> click your account icon (top-right) -> "SMTP & API"
- "SMTP" tab -> note the SMTP login (an email like
  `9abcdef@smtp-brevo.com` or your account email) and click
  "Generate a new SMTP key" to copy a long key starting with
  `xsmtpsib-...`.
- Left sidebar -> "Senders, Domains & Dedicated IPs" -> "Senders" ->
  "Add a sender" -> enter the From: email you want recipients to see
  (e.g. your Kathford email) -> click the confirmation link Brevo
  emails you. This is the address you put in `BREVO_SENDER`.

Put those three values in `backend/.env` like this (do NOT commit it):
  BREVO_LOGIN=your_login@smtp-brevo.com
  BREVO_SMTP_KEY=xsmtpsib-...
  BREVO_SENDER=your_verified_sender@example.com

Other env vars used:
  APP_BASE_URL    -> frontend base URL embedded in the link
                     (default http://localhost:3000)
  MAIL_DEV_DUMP   -> overrides the in-file MAIL_DEV_DUMP constant;
                     "1" prints to the terminal, "0" actually sends
"""

import os
import smtplib
from email.message import EmailMessage

# Best-effort load of backend/.env so local development picks up
# BREVO_LOGIN / BREVO_SMTP_KEY / BREVO_SENDER automatically. We point
# load_dotenv() at the file explicitly (instead of relying on cwd
# discovery) so it works whether the backend is started from `backend/`
# or from the project root. If python-dotenv isn't installed, callers
# can still export the vars in the shell -- no hard dependency.
try:
    from pathlib import Path
    from dotenv import load_dotenv
    # mailer.py lives at backend/app/utils/mailer.py -> backend/.env is
    # two directories up from this file's parent.
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass


# ============================================================================
# BREVO CREDENTIALS  ->  set these in backend/.env (NEVER in this file)
# ----------------------------------------------------------------------------
# These module-level names exist only so the helpers below have a sane
# default (empty string) when the env var isn't set. Do NOT paste real
# credentials here -- it leaks them into git history. Put real values
# in `backend/.env` instead (see `backend/.env.example`).
# ============================================================================
BREVO_LOGIN     = os.environ.get("BREVO_LOGIN", "")     # set in backend/.env
BREVO_SMTP_KEY  = os.environ.get("BREVO_SMTP_KEY", "")  # set in backend/.env
BREVO_SENDER    = os.environ.get("BREVO_SENDER", "")    # set in backend/.env
# ============================================================================

# ----------------------------------------------------------------------------
# DELIVERY MODE TOGGLE
# ----------------------------------------------------------------------------
# "1" = dev-dump  (print the verification link to the backend terminal,
#                  do NOT contact Brevo)
# "0" = real send (route the email through Brevo using the credentials
#                  above)
# The MAIL_DEV_DUMP environment variable, if set, always overrides this
# constant -- so you can flip to dev-dump for a viva demo with
#     $env:MAIL_DEV_DUMP = "1"
# without editing this file.
# ----------------------------------------------------------------------------
MAIL_DEV_DUMP = "0"

# Brevo SMTP relay endpoint -- do NOT change unless Brevo tells you to.
BREVO_HOST = "smtp-relay.brevo.com"
BREVO_PORT = 587

# Default frontend base URL embedded in the verification link.
APP_BASE_URL_DEFAULT = "http://localhost:3000"


def _env(name, default=""):
    return os.environ.get(name, default)


def _login():
    # Env var wins so prod can override without editing code.
    return _env("BREVO_LOGIN", BREVO_LOGIN)


def _key():
    return _env("BREVO_SMTP_KEY", BREVO_SMTP_KEY)


def _sender():
    # Sensible fallback: if the verified sender wasn't filled in, fall back
    # to the SMTP login (Brevo accepts the login as a verified sender by
    # default), so a half-configured setup still has a valid From: header.
    return _env("BREVO_SENDER", BREVO_SENDER) or _login()


def _is_dev_dump():
    # Env var wins over the in-file constant, mirroring the BREVO_* getters.
    return _env("MAIL_DEV_DUMP", MAIL_DEV_DUMP) == "1"


def _build_link(raw_token):
    base = _env("APP_BASE_URL", APP_BASE_URL_DEFAULT).rstrip("/")
    return f"{base}/reviewer/verify-email?token={raw_token}"


def send_verification_email(to_email, raw_token):
    """Send (or dev-dump) the institutional-email verification link.

    Returns the link string for callers/tests to assert against.
    """
    link = _build_link(raw_token)
    smtp_user = _login()
    smtp_pass = _key()
    smtp_from = _sender()

    # Dev path: no real send. Triggered by either MAIL_DEV_DUMP=1 (default)
    # or by a missing SMTP key (so a half-configured machine fails open into
    # the dev-dump rather than 500-ing the /apply route).
    if _is_dev_dump() or not smtp_pass:
        print(f"[MAIL->{to_email}] Verify your institutional email: {link}")
        return link

    msg = EmailMessage()
    msg["Subject"] = "Authentiq - Verify your institutional email"
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg.set_content(
        "Hello,\n\n"
        "Click the link below to verify this address as your institutional "
        "email for your Authentiq reviewer application. The link expires in "
        "24 hours and can be used only once.\n\n"
        f"{link}\n\n"
        "If you did not request this, you can ignore this email."
    )

    with smtplib.SMTP(BREVO_HOST, BREVO_PORT) as s:
        s.starttls()
        s.login(smtp_user, smtp_pass)
        s.send_message(msg)

    return link
