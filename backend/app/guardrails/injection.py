"""Prompt-injection / jailbreak detection (reference heuristic).

A dependency-free first line of defense. Swap in a trained classifier behind the
same ``check`` signature without touching callers.
"""

from __future__ import annotations

import re

from app.guardrails.base import Verdict

_PATTERNS = [
    r"ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+"
    r"(instructions?|prompts?|messages?|rules?)",
    r"disregard\s+(the\s+)?(above|previous|prior|all|your)",
    r"forget\s+(everything|all|your)\b",
    r"reveal\s+(the\s+|your\s+)?(system\s+)?(prompt|instructions?)",
    r"(print|show|repeat|output)\s+(me\s+)?(the\s+|your\s+)?(system\s+)?(prompt|instructions?)",
    r"you\s+are\s+now\b",
    r"developer\s+mode",
    r"jailbreak",
    r"\bDAN\b",
    r"act\s+as\s+(an?\s+)?(unfiltered|unrestricted|uncensored)",
    r"bypass\s+(your\s+)?(safety|guardrails?|restrictions?|filters?)",
]
_REGEX = re.compile("|".join(_PATTERNS), re.IGNORECASE)


def check(text: str) -> Verdict:
    match = _REGEX.search(text)
    if match:
        return Verdict(
            allowed=False,
            category="injection",
            reason="possible prompt injection or jailbreak attempt",
            details={"match": match.group(0)},
        )
    return Verdict.ok("injection")
