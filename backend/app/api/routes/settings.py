"""Runtime settings endpoints (Phase 7).

Read and update operator config (model, BYO OpenRouter key, guardrail toggles,
rate limit) without a restart. Secrets are never returned: the snapshot reports
only whether a user key is set and whether the shared demo key is in use.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.logging import get_logger
from app.core.runtime_settings import runtime
from app.llm.providers import OpenAICompatibleProvider

logger = get_logger(__name__)

router = APIRouter()

# Shown if OpenRouter's model list can't be fetched (no key / offline), so the
# dropdown is never empty.
_FALLBACK_MODELS = [
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-haiku-4.5",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.3-70b-instruct",
]


class SettingsPatch(BaseModel):
    """Partial update from the Settings page; only provided fields are written."""

    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    enable_thinking: bool | None = None
    # Empty string clears the user's key (reverting to the demo key).
    openrouter_api_key: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    guardrails_enabled: bool | None = None
    injection: bool | None = None
    grounding: bool | None = None
    pii_detect: bool | None = None
    safety: bool | None = None
    pii_mask: bool | None = None
    safety_model: str | None = None
    ratelimit_enabled: bool | None = None
    ratelimit_per_minute: int | None = None


# Maps the flat request fields onto the namespaced storage keys.
_KEY_MAP = {
    "provider": "llm.provider",
    "model": "llm.model",
    "base_url": "llm.base_url",
    "enable_thinking": "llm.enable_thinking",
    "openrouter_api_key": "llm.openrouter_api_key",
    "temperature": "gen.temperature",
    "max_tokens": "gen.max_tokens",
    "guardrails_enabled": "guardrails.enabled",
    "injection": "guardrails.injection",
    "grounding": "guardrails.grounding",
    "pii_detect": "guardrails.pii_detect",
    "safety": "guardrails.safety",
    "pii_mask": "guardrails.pii_mask",
    "safety_model": "guardrails.safety_model",
    "ratelimit_enabled": "ratelimit.enabled",
    "ratelimit_per_minute": "ratelimit.per_minute",
}


@router.get("/settings")
async def get_settings_endpoint() -> dict[str, Any]:
    """Return the effective config (secrets masked)."""
    return runtime.snapshot()


@router.put("/settings")
async def update_settings_endpoint(body: SettingsPatch) -> dict[str, Any]:
    """Apply a partial update, hot-reload the provider, and return the new snapshot."""
    patch = {
        _KEY_MAP[field]: value
        for field, value in body.model_dump(exclude_none=True).items()
        if field in _KEY_MAP
    }
    if patch:
        await runtime.update(patch)
    return runtime.snapshot()


@router.get("/settings/models")
async def list_models_endpoint() -> dict[str, Any]:
    """Proxy the provider's model catalogue (OpenRouter), failing soft to a static list."""
    url = runtime.get_llm_base_url().rstrip("/") + "/models"
    key = runtime.get_resolved_api_key()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
        models = sorted(m["id"] for m in data.get("data", []) if m.get("id"))
        if models:
            return {"models": models, "source": "live"}
    except Exception:
        logger.warning("model_list_failed", exc_info=True)
    return {"models": _FALLBACK_MODELS, "source": "fallback"}


@router.post("/settings/test-llm")
async def test_llm_endpoint() -> dict[str, Any]:
    """Probe the currently configured provider for reachability."""
    provider = OpenAICompatibleProvider(
        name=runtime.get_llm_provider(),
        model=runtime.get_llm_model(),
        base_url=runtime.get_llm_base_url(),
        api_key=runtime.get_resolved_api_key(),
    )
    ok = await provider.health()
    return {
        "ok": ok,
        "provider": runtime.get_llm_provider(),
        "model": runtime.get_llm_model(),
        "detail": "reachable" if ok else "unreachable (check key / model / base URL)",
    }
