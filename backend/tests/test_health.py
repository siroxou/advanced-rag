"""Health endpoint boots without any external dependency (LLM/DB may be down)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_health_ok() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["llm_model"]
    assert isinstance(body["llm_reachable"], bool)
