"""Per-IP sliding-window rate limit for the chat endpoints.

Pure-ASGI (not ``BaseHTTPMiddleware``) so an allowed request passes straight
through to the app, leaving the SSE streaming response untouched. Only enforced
when a request would actually spend the shared demo OpenRouter key - local
providers and bring-your-own keys are never throttled - and the config is read
from ``RuntimeSettings`` on every request, so the Settings-page toggle is live.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.logging import get_logger
from app.core.runtime_settings import runtime

logger = get_logger(__name__)

_WINDOW_SECONDS = 60.0

LIMIT_MESSAGE = (
    "Rate limit exceeded on the shared demo key. "
    "Add your own OpenRouter key in Settings to lift this limit."
)


class RateLimitMiddleware:
    """Throttle ``path_prefix`` requests per client IP to N per minute."""

    def __init__(self, app: ASGIApp, *, path_prefix: str = "/api/chat") -> None:
        self.app = app
        self._prefix = path_prefix
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(self._prefix):
            await self.app(scope, receive, send)
            return
        # Skip entirely unless this request would spend the shared demo key.
        if not runtime.ratelimit_enabled() or not runtime.using_demo_key():
            await self.app(scope, receive, send)
            return

        per_minute = max(1, runtime.ratelimit_per_minute())
        client = scope.get("client")
        key = client[0] if client else "unknown"
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] >= _WINDOW_SECONDS:
            window.popleft()

        if len(window) >= per_minute:
            retry_after = int(_WINDOW_SECONDS - (now - window[0])) + 1
            logger.info("rate_limited", client=key, per_minute=per_minute)
            response = JSONResponse(
                status_code=429,
                content={"detail": LIMIT_MESSAGE},
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        window.append(now)
        await self.app(scope, receive, send)
