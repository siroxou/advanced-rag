"""Optional LangFuse tracing.

No-op unless ``LANGFUSE_PUBLIC_KEY``/``LANGFUSE_SECRET_KEY`` are configured and the
``obs`` extra (langfuse) is installed - so the default path has zero overhead and
no extra dependency. Wrap a request to record the user, query, retrieved sources,
guardrail verdicts, and latency as a trace.

    async with trace("chat", user_id=user.username, metadata={...}):
        ...
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def is_enabled() -> bool:
    return bool(settings.langfuse_public_key and settings.langfuse_secret_key)


@lru_cache
def _client() -> Any | None:
    if not is_enabled():
        return None
    try:
        from langfuse import Langfuse

        return Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    except Exception:  # SDK missing or init failed
        logger.warning("langfuse_init_failed", exc_info=True)
        return None


@asynccontextmanager
async def trace(
    name: str, *, user_id: str, metadata: dict[str, Any] | None = None
) -> AsyncIterator[None]:
    client = _client()
    if client is None:
        yield
        return
    client.trace(name=name, user_id=user_id, metadata=metadata or {})
    try:
        yield
    finally:
        try:
            client.flush()
        except Exception:
            logger.warning("langfuse_flush_failed", exc_info=True)
