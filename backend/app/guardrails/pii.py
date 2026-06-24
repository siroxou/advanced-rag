"""PII detection (reference regex impl; Presidio drops in behind the same call)."""

from __future__ import annotations

import re

from app.guardrails.base import Verdict

_PATTERNS = {
    "email": re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    "phone": re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]?){13,16}\b"),
}


def detect(text: str) -> Verdict:
    found = sorted(name for name, pattern in _PATTERNS.items() if pattern.search(text))
    return Verdict(
        allowed=not found,
        category="pii",
        reason="PII detected" if found else "",
        details={"categories": found},
    )
