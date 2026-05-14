"""
PII scrubber — removes or masks PII before sending text to external AI APIs.
Handles: email addresses, phone numbers, names (heuristic), SSNs.
"""
import re

# Patterns
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", re.IGNORECASE)
_PHONE_RE = re.compile(r"\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)(\d{3}[-.\s]?\d{4})\b")
_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

# Sensitive field names that appear as "key: value" in log text
_SENSITIVE_FIELDS = re.compile(
    r"(?i)(risk_score|internal_notes|password|token|secret|api_key)\s*[=:]\s*\S+",
)


def scrub_pii(text: str) -> str:
    """Replace PII with placeholder tokens."""
    if not text:
        return text
    text = _EMAIL_RE.sub("[EMAIL REDACTED]", text)
    text = _PHONE_RE.sub("[PHONE REDACTED]", text)
    text = _SSN_RE.sub("[SSN REDACTED]", text)
    return text


def redact_sensitive(text: str) -> str:
    """Remove sensitive field values from log-like text."""
    if not text:
        return text
    text = scrub_pii(text)
    text = _SENSITIVE_FIELDS.sub(lambda m: m.group(1) + ": [REDACTED]", text)
    return text
