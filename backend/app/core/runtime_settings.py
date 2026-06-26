"""DB-backed runtime settings with env fallback and hot-reload.

The env ``settings`` singleton is the default layer; rows in ``app_settings``
override it at runtime. Every getter returns the override when present, else the
env default, so the app behaves identically whether or not the table has been
populated - and even if Postgres is down at boot, since ``load`` fails soft and
leaves the cache empty.

Keys are namespaced strings (``llm.model``, ``guardrails.injection``, ...). On
``update`` the cache is refreshed and the cached LLM provider is dropped so the
next ``get_llm`` rebuilds against the new config - no restart needed.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text

from app.core.config import settings
from app.core.db import SessionFactory
from app.core.logging import get_logger

logger = get_logger(__name__)

# OpenRouter is the hosted-demo gateway: one OpenAI-compatible endpoint fronting
# many providers. Used as the base_url whenever the provider is "openrouter".
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_PROVIDER_BASE_URLS = {
    "openrouter": OPENROUTER_BASE_URL,
    "openai": "https://api.openai.com/v1",
}


def _as_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


class RuntimeSettings:
    """In-memory overlay over ``app_settings``, loaded once and updated in place."""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}

    async def load(self) -> None:
        """Populate the cache from the table. Fail soft if the DB is unreachable."""
        try:
            async with SessionFactory() as session:
                rows = (await session.execute(text("SELECT key, value FROM app_settings"))).all()
            self._cache = {key: value for key, value in rows}
            logger.info("runtime_settings_loaded", keys=len(self._cache))
        except Exception:
            logger.warning("runtime_settings_load_failed", exc_info=True)
            self._cache = {}

    async def update(self, patch: dict[str, Any]) -> None:
        """Upsert each key, refresh the cache, and rebuild the LLM provider."""
        async with SessionFactory() as session:
            for key, value in patch.items():
                await session.execute(
                    text(
                        "INSERT INTO app_settings (key, value) "
                        "VALUES (:k, CAST(:v AS JSONB)) "
                        "ON CONFLICT (key) DO UPDATE "
                        "SET value = EXCLUDED.value, updated_at = now()"
                    ),
                    {"k": key, "v": json.dumps(value)},
                )
            await session.commit()
        self._cache.update(patch)
        # Provider config may have changed; drop the cached client so the next
        # get_llm() rebuilds. Local import avoids a factory<->settings import cycle.
        from app.llm.factory import reset_llm

        reset_llm()

    def _get(self, key: str, default: Any) -> Any:
        value = self._cache.get(key)
        return default if value is None else value

    # --- LLM / provider ---------------------------------------------------------
    def get_llm_provider(self) -> str:
        return str(self._get("llm.provider", settings.llm_provider))

    def get_llm_model(self) -> str:
        return str(self._get("llm.model", settings.llm_model))

    def get_llm_base_url(self) -> str:
        override = self._cache.get("llm.base_url")
        if override:
            return str(override)
        # Known providers have a canonical base_url; otherwise fall back to env.
        provider = self.get_llm_provider()
        return _PROVIDER_BASE_URLS.get(provider, settings.llm_base_url)

    def get_enable_thinking(self) -> bool:
        return _as_bool(
            self._get("llm.enable_thinking", settings.llm_enable_thinking),
            settings.llm_enable_thinking,
        )

    def get_user_openrouter_key(self) -> str:
        """The user's own OpenRouter key (empty when none has been saved)."""
        return str(self._cache.get("llm.openrouter_api_key") or "")

    def get_resolved_api_key(self) -> str:
        """BYO key wins; else the shared demo key; else the env ``llm_api_key``."""
        user = self.get_user_openrouter_key()
        if user:
            return user
        if settings.openrouter_api_key:
            return settings.openrouter_api_key
        return settings.llm_api_key

    def using_demo_key(self) -> bool:
        """True only when a request would spend the shared demo OpenRouter key."""
        return not self.get_user_openrouter_key() and bool(settings.openrouter_api_key)

    # --- Generation defaults ----------------------------------------------------
    def get_temperature(self) -> float:
        return float(self._get("gen.temperature", settings.gen_temperature))

    def get_max_tokens(self) -> int:
        return int(self._get("gen.max_tokens", settings.gen_max_tokens))

    # --- Guardrails -------------------------------------------------------------
    def _flag(self, key: str, env_default: bool) -> bool:
        """The flag's own stored/effective value, independent of the master switch."""
        return _as_bool(self._get(key, env_default), env_default)

    def _guard_master(self) -> bool:
        return self._flag("guardrails.enabled", settings.guardrails_enabled)

    def _guard(self, key: str, env_default: bool) -> bool:
        # Each per-guardrail flag is gated by the master kill switch.
        return self._guard_master() and self._flag(key, env_default)

    def guard_injection(self) -> bool:
        return self._guard("guardrails.injection", settings.guardrails_injection)

    def guard_grounding(self) -> bool:
        return self._guard("guardrails.grounding", settings.guardrails_grounding)

    def guard_pii_detect(self) -> bool:
        return self._guard("guardrails.pii_detect", settings.guardrails_pii_detect)

    def guard_safety(self) -> bool:
        return self._guard("guardrails.safety", settings.guardrails_safety)

    def guard_pii_mask(self) -> bool:
        return self._guard("guardrails.pii_mask", settings.guardrails_pii_mask)

    def get_safety_model(self) -> str:
        return str(self._get("guardrails.safety_model", settings.guardrails_safety_model))

    # --- Rate limiting ----------------------------------------------------------
    def ratelimit_enabled(self) -> bool:
        return _as_bool(
            self._get("ratelimit.enabled", settings.ratelimit_enabled),
            settings.ratelimit_enabled,
        )

    def ratelimit_per_minute(self) -> int:
        return int(self._get("ratelimit.per_minute", settings.ratelimit_per_minute))

    # --- Snapshot for the Settings API ------------------------------------------
    def snapshot(self) -> dict[str, Any]:
        """Effective config for the Settings page. Never includes a raw API key."""
        return {
            "llm": {
                "provider": self.get_llm_provider(),
                "model": self.get_llm_model(),
                "base_url": self.get_llm_base_url(),
                "enable_thinking": self.get_enable_thinking(),
                "openrouter_user_key_set": bool(self.get_user_openrouter_key()),
                "using_demo_key": self.using_demo_key(),
            },
            "gen": {
                "temperature": self.get_temperature(),
                "max_tokens": self.get_max_tokens(),
            },
            "guardrails": {
                "enabled": self._guard_master(),
                "injection": self._flag("guardrails.injection", settings.guardrails_injection),
                "grounding": self._flag("guardrails.grounding", settings.guardrails_grounding),
                "pii_detect": self._flag("guardrails.pii_detect", settings.guardrails_pii_detect),
                "safety": self._flag("guardrails.safety", settings.guardrails_safety),
                "pii_mask": self._flag("guardrails.pii_mask", settings.guardrails_pii_mask),
                "safety_model": self.get_safety_model(),
            },
            "ratelimit": {
                "enabled": self.ratelimit_enabled(),
                "per_minute": self.ratelimit_per_minute(),
            },
        }


# Process-wide singleton, mirroring the env ``settings`` singleton.
runtime = RuntimeSettings()
