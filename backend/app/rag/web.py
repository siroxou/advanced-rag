"""Live web search via Tavily (Phase 3).

Permission-gated and optional: without ``TAVILY_API_KEY`` the search is a no-op,
so the agent graph degrades gracefully to documents-only. Uses httpx directly to
avoid another dependency.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_TAVILY_URL = "https://api.tavily.com/search"

# Roles permitted to reach the public internet. Viewers are documents-only.
WEB_ALLOWED_ROLES = frozenset({"analyst", "admin"})


@dataclass(slots=True)
class WebResult:
    title: str
    url: str
    content: str


def web_allowed(roles: Sequence[str]) -> bool:
    """True only if the caller's roles permit web search and a key is configured."""
    return bool(set(roles) & WEB_ALLOWED_ROLES) and bool(settings.tavily_api_key)


async def web_search(query: str, *, max_results: int = 4) -> list[WebResult]:
    if not settings.tavily_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                _TAVILY_URL,
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:  # network/api failure should not break the answer path
        logger.warning("web_search_failed", exc_info=True)
        return []

    return [
        WebResult(
            title=item.get("title", ""),
            url=item.get("url", ""),
            content=item.get("content", ""),
        )
        for item in data.get("results", [])[:max_results]
    ]
