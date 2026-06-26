"""Build the LLM provider from runtime settings, caching the live instance.

Unlike a plain ``@lru_cache``, the cache here is explicitly resettable: when an
operator changes the model or API key from the Settings page, ``reset_llm`` drops
the instance so the next ``get_llm`` rebuilds against the new config - no restart.
"""

from __future__ import annotations

from app.core.runtime_settings import OPENROUTER_BASE_URL, runtime
from app.llm.base import LLMProvider
from app.llm.providers import OpenAICompatibleProvider

_cached: LLMProvider | None = None


def get_llm() -> LLMProvider:
    """Return the configured provider, building (and caching) it on first use."""
    global _cached
    if _cached is None:
        provider = runtime.get_llm_provider()
        base_url = runtime.get_llm_base_url()
        # OpenRouter ranks integrations by these headers; harmless elsewhere.
        headers = (
            {"HTTP-Referer": "https://github.com/siroxou/advanced-rag", "X-Title": "Advanced RAG"}
            if base_url == OPENROUTER_BASE_URL
            else None
        )
        _cached = OpenAICompatibleProvider(
            name=provider,
            model=runtime.get_llm_model(),
            base_url=base_url,
            api_key=runtime.get_resolved_api_key(),
            enable_thinking=runtime.get_enable_thinking(),
            default_headers=headers,
        )
    return _cached


def reset_llm() -> None:
    """Drop the cached provider so the next ``get_llm`` rebuilds from settings."""
    global _cached
    _cached = None
