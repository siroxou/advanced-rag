"""The settings endpoint exposes effective config without leaking the API key."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.core.runtime_settings import runtime
from app.main import app
from app.security.tokens import create_access_token


def test_get_settings_masks_secrets() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/settings")
    assert resp.status_code == 200
    body = resp.json()
    # The shared demo key must never appear in the response, only booleans about it.
    assert "sk-or-" not in json.dumps(body)
    assert isinstance(body["llm"]["openrouter_user_key_set"], bool)
    assert isinstance(body["llm"]["using_demo_key"], bool)
    assert "model" in body["llm"]
    assert "guardrails" in body and "ratelimit" in body


def test_put_saves_the_provider_neutral_api_key(monkeypatch) -> None:
    # The page sends api_key; an unknown field would be dropped silently and the
    # UI would still report "Key saved".
    saved: dict[str, object] = {}

    async def fake_update(patch: dict[str, object]) -> None:
        saved.update(patch)

    monkeypatch.setattr(runtime, "update", fake_update)
    auth = {"Authorization": f"Bearer {create_access_token('ada', ['admin'])}"}
    with TestClient(app) as client:
        resp = client.put("/api/settings", json={"api_key": "sk-test"}, headers=auth)
    assert resp.status_code == 200
    assert saved == {"llm.openrouter_api_key": "sk-test"}
