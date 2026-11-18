"""Sends the customer quote email for real via SMTP if credentials are
configured; otherwise logs to the console and reports itself as mocked. No
AWS SES path in v2 -- this project intentionally has no AWS dependency at
all, which is itself part of the v1-vs-v2 comparison.
"""
from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText

_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
_PORT = int(os.environ.get("SMTP_PORT", "587"))
_USERNAME = os.environ.get("SMTP_USERNAME")
_PASSWORD = os.environ.get("SMTP_PASSWORD")
_FROM = os.environ.get("SMTP_FROM", _USERNAME)
_TEST_OVERRIDE = os.environ.get("TEST_EMAIL_OVERRIDE")


def is_configured() -> bool:
    return bool(_USERNAME and _PASSWORD)


def send_email(to_email: str, subject: str, body: str) -> dict:
    if _TEST_OVERRIDE:
        subject = f"[to: {to_email}] {subject}"
        to_email = _TEST_OVERRIDE

    if not is_configured():
        print(f"[email_sender] MOCK (no SMTP_USERNAME/SMTP_PASSWORD configured) -- would send to {to_email}: {subject}")
        return {"sent": False, "mocked": True, "error": None}

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = _FROM
    message["To"] = to_email
    try:
        with smtplib.SMTP(_HOST, _PORT) as server:
            server.starttls()
            server.login(_USERNAME, _PASSWORD)
            server.sendmail(_FROM, [to_email], message.as_string())
        return {"sent": True, "mocked": False, "error": None}
    except Exception as exc:  # noqa: BLE001
        return {"sent": False, "mocked": False, "error": str(exc)}
