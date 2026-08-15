"""Mutating endpoints demand a real token; reads stay open to the demo identity.

The demo identity can claim any roles it likes (that is what makes the RBAC demo
work without a login), so these tests pin the property that actually protects the
system: role claims alone never authorize a mutation - only a signed token does.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.security.tokens import create_access_token


def _auth(username: str, roles: list[str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(username, roles)}"}


def test_mutation_without_a_token_is_401() -> None:
    with TestClient(app) as client:
        assert client.put("/api/settings", json={}).status_code == 401
        assert (
            client.post("/api/admin/users", params={"username": "x", "password": "y"}).status_code
            == 401
        )
        assert client.post("/api/presets/fred-core/ingest", json={}).status_code == 401


def test_demo_roles_header_cannot_unlock_a_mutation() -> None:
    # Claiming admin without a token must not be enough - this is the whole point
    # of tracking `authenticated` separately from `roles`.
    with TestClient(app) as client:
        resp = client.put("/api/settings", json={}, headers={"X-Demo-Roles": "admin"})
    assert resp.status_code == 401


def test_authenticated_non_admin_is_403() -> None:
    with TestClient(app) as client:
        resp = client.put("/api/settings", json={}, headers=_auth("vera", ["viewer"]))
    assert resp.status_code == 403
    assert "admin" in resp.json()["detail"]


def test_authenticated_admin_passes_the_gate() -> None:
    with TestClient(app) as client:
        resp = client.put("/api/settings", json={}, headers=_auth("ada", ["viewer", "admin"]))
    # Past the gate: the handler runs and returns the settings snapshot.
    assert resp.status_code == 200
    assert "guardrails" in resp.json()


def test_reads_stay_open_to_the_demo_identity() -> None:
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/settings").status_code == 200
