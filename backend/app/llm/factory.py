"""Build the configured LLM provider once and cache it."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.llm.base import LLMProvider
from app.llm.providers import OpenAICompatibleProvider


@lru_cache
def get_llm() -> LLMProvider:
    # Ollama and vLLM are both OpenAI-compatible; one implementation serves both.
    return OpenAICompatibleProvider(
        name=settings.llm_provider,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        enable_thinking=settings.llm_enable_thinking,
    )
