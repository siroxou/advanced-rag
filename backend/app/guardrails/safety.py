"""Optional ShieldGemma-style safety classification via the LLM abstraction.

A no-op unless ``GUARDRAILS_SAFETY_MODEL`` is set, so the default path adds no
latency. Fails open on classifier/infra error (an outage must not block all traffic).
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.core.logging import get_logger
from app.guardrails.base import Verdict
from app.llm.base import ChatMessage
from app.llm.providers import OpenAICompatibleProvider

logger = get_logger(__name__)

_SAFETY_SYS = (
    "You are a content-safety classifier. Decide if the TEXT is unsafe: hate or harassment, "
    "sexual content involving minors, self-harm instructions, credible violent threats, or "
    "instructions for weapons or malware. Reply with exactly one word: SAFE or UNSAFE."
)


@lru_cache
def _provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        name=settings.llm_provider,
        model=settings.guardrails_safety_model,
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
    )


async def check(text: str) -> Verdict:
    if not settings.guardrails_safety_model:
        return Verdict.ok("safety")
    try:
        out = await _provider().chat(
            [
                ChatMessage(role="system", content=_SAFETY_SYS),
                ChatMessage(role="user", content=f"TEXT:\n{text}"),
            ],
            temperature=0.0,
            max_tokens=8,
        )
    except Exception:
        logger.warning("safety_check_failed", exc_info=True)
        return Verdict.ok("safety")  # fail open on infra error
    if "unsafe" in out.strip().lower():
        return Verdict(allowed=False, category="safety", reason="flagged unsafe by safety model")
    return Verdict.ok("safety")
