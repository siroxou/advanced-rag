"""The settings endpoint exposes effective config without leaking the API key."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app


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
