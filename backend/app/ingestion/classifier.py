"""LLM-driven document classification for RBAC tiering.

Read a document and propose a sensitivity tier, which maps to the
``allowed_roles`` that gate retrieval. This lets a user drop raw PDFs into the
corpus and have access tiers assigned automatically instead of hand-tagging
every file.

It is a *convenience, not a security boundary*. The model can misjudge, so
classification **fails closed**: an empty document, an unreadable verdict, a
classifier outage, or any deterministic high-risk PII lands the document in the
most restrictive tier (admin-only) rather than the most open one. Pair it with a
human review step - the CLI ``--dry-run`` preview, or an admin UI - before the
corpus serves real users. Under-classifying leaks; over-classifying only annoys.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.core.logging import get_logger
from app.guardrails.pii import detect as detect_pii
from app.ingestion.pdf import extract_pages
from app.llm.base import ChatMessage, LLMProvider

logger = get_logger(__name__)

# Tiers in increasing order of restriction. Role grants are cumulative: a higher
# tier is a subset of the roles below it, matching the seeded users (admin holds
# every role, analyst holds viewer+analyst). Retrieval keeps a row only when a
# caller's roles overlap these, so "restricted" => admin alone can read it.
_TIER_ROLES: dict[str, list[str]] = {
    "public": ["viewer", "analyst", "admin"],
    "internal": ["analyst", "admin"],
    "restricted": ["admin"],
}

# When in doubt, refuse to guess open.
_FAIL_CLOSED_TIER = "restricted"
# PII the regex layer detects with high precision; its presence forces the most
# restrictive tier regardless of the model's opinion. Emails/phones are excluded
# on purpose - they appear in public contact footers and would over-trigger.
_HARD_PII = frozenset({"ssn", "credit_card"})
# How much text the classifier reads. Tier signal shows up early, and capping
# keeps the call cheap and inside context for long PDFs.
_MAX_CHARS = 6000

_SYSTEM = (
    "You are a data-governance classifier for an enterprise document store. "
    "Read the excerpt and assign exactly ONE access tier:\n"
    "- public: marketing, public website copy, handbooks, FAQs, press releases; "
    "safe for anyone.\n"
    "- internal: operational material not meant for outsiders - metrics, roadmaps, "
    "runbooks, internal policy, meeting notes.\n"
    "- restricted: highly sensitive - compensation/salary, board or M&A material, "
    "legal matters, security incidents, credentials, or personal data; would harm "
    "the company if leaked.\n"
    "When torn between two tiers, choose the MORE restrictive one. "
    'Return ONLY JSON: {"sensitivity": "public|internal|restricted", '
    '"reason": "<= 15 words", "confidence": 0.0-1.0}.'
)


@dataclass(slots=True)
class Classification:
    sensitivity: str
    allowed_roles: list[str]
    reason: str
    confidence: float = 0.0
    auto: bool = True  # False once a human overrides the suggestion

    @classmethod
    def for_tier(
        cls,
        tier: str,
        *,
        reason: str,
        confidence: float = 0.0,
        auto: bool = True,
    ) -> Classification:
        """Build a classification, snapping an unknown tier to fail-closed."""
        safe = tier if tier in _TIER_ROLES else _FAIL_CLOSED_TIER
        return cls(
            sensitivity=safe,
            allowed_roles=list(_TIER_ROLES[safe]),
            reason=reason,
            confidence=confidence,
            auto=auto,
        )


def _parse(raw: str) -> tuple[str, str, float] | None:
    """Pull the verdict out of the model's reply; None if it is unreadable."""
    try:
        start, end = raw.index("{"), raw.rindex("}")
        obj = json.loads(raw[start : end + 1])
        tier = str(obj["sensitivity"]).strip().lower()
        reason = str(obj.get("reason", "")).strip()
        confidence = float(obj.get("confidence", 0.0))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
    return tier, reason, confidence


async def classify(llm: LLMProvider, text: str) -> Classification:
    """Propose an access tier for a document. Fails closed to ``restricted``."""
    excerpt = text[:_MAX_CHARS].strip()
    if not excerpt:
        # No extractable text (e.g. a scanned image PDF) - do not publish it.
        return Classification.for_tier(
            _FAIL_CLOSED_TIER, reason="no extractable text", confidence=1.0
        )

    # Deterministic floor: known high-risk PII is admin-only no matter the model.
    hard = _HARD_PII & set(detect_pii(excerpt).details.get("categories", []))
    if hard:
        return Classification.for_tier(
            "restricted", reason=f"contains {', '.join(sorted(hard))}", confidence=1.0
        )

    try:
        raw = await llm.chat(
            [
                ChatMessage(role="system", content=_SYSTEM),
                ChatMessage(role="user", content=f"Document excerpt:\n{excerpt}"),
            ],
            temperature=0.0,
            max_tokens=256,
        )
    except Exception:  # an outage must not silently widen access
        logger.warning("classify_llm_failed", exc_info=True)
        return Classification.for_tier(
            _FAIL_CLOSED_TIER, reason="classifier unavailable; failed closed"
        )

    parsed = _parse(raw)
    if parsed is None:
        logger.warning("classify_unparseable", raw=raw[:200])
        return Classification.for_tier(
            _FAIL_CLOSED_TIER, reason="unparseable verdict; failed closed"
        )

    tier, reason, confidence = parsed
    return Classification.for_tier(tier, reason=reason or "model verdict", confidence=confidence)


async def classify_pdf(llm: LLMProvider, path: Path) -> Classification:
    """Extract a PDF's text and classify it."""
    pages = extract_pages(path)
    return await classify(llm, "\n\n".join(p.text for p in pages))
