"""Unit tests for the rate-limit ASGI middleware (no real endpoints)."""

from __future__ import annotations

from typing import Any

from app.core.ratelimit import RateLimitMiddleware


async def _dummy_app(scope: dict, receive: Any, send: Any) -> None:
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def _scope(path: str = "/api/chat/stream", ip: str = "1.2.3.4") -> dict[str, Any]:
    return {"type": "http", "path": path, "client": (ip, 1234), "headers": []}


async def _receive() -> dict[str, Any]:
    return {"type": "http.request", "body": b"", "more_body": False}


class _Capture:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def __call__(self, message: dict[str, Any]) -> None:
        self.messages.append(message)

    @property
    def status(self) -> int | None:
        for m in self.messages:
            if m["type"] == "http.response.start":
                return int(m["status"])
        return None


def _force(monkeypatch, *, enabled: bool, demo: bool, per_minute: int) -> None:
    import app.core.ratelimit as mod

    monkeypatch.setattr(mod.runtime, "ratelimit_enabled", lambda: enabled)
    monkeypatch.setattr(mod.runtime, "using_demo_key", lambda: demo)
    monkeypatch.setattr(mod.runtime, "ratelimit_per_minute", lambda: per_minute)


async def test_second_request_is_throttled(monkeypatch):
    _force(monkeypatch, enabled=True, demo=True, per_minute=1)
    mw = RateLimitMiddleware(_dummy_app)
    first, second = _Capture(), _Capture()
    await mw(_scope(), _receive, first)
    await mw(_scope(), _receive, second)
    assert first.status == 200
    assert second.status == 429


async def test_byo_key_bypasses_limit(monkeypatch):
    # demo=False models a request carrying the user's own key.
    _force(monkeypatch, enabled=True, demo=False, per_minute=1)
    mw = RateLimitMiddleware(_dummy_app)
    for _ in range(3):
        cap = _Capture()
        await mw(_scope(), _receive, cap)
        assert cap.status == 200


async def test_non_chat_paths_are_never_limited(monkeypatch):
    _force(monkeypatch, enabled=True, demo=True, per_minute=1)
    mw = RateLimitMiddleware(_dummy_app)
    for _ in range(3):
        cap = _Capture()
        await mw(_scope(path="/api/health"), _receive, cap)
        assert cap.status == 200


async def test_disabled_lets_everything_through(monkeypatch):
    _force(monkeypatch, enabled=False, demo=True, per_minute=1)
    mw = RateLimitMiddleware(_dummy_app)
    for _ in range(3):
        cap = _Capture()
        await mw(_scope(), _receive, cap)
        assert cap.status == 200
