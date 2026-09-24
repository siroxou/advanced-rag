"""Mutating endpoints demand a real token; reads stay open to the demo identity.

The demo identity can claim any roles it likes (that is what makes the RBAC demo
work without a login), so these tests pin the property that actually protects the
system: role claims alone never authorize a mutation - only a signed token does.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import get_session
from app.main import app
from app.security.tokens import create_access_token


def _auth(username: str, roles: list[str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(username, roles)}"}


class _FakeSession:
    """Just enough AsyncSession for one-query handlers, so these run offline."""

    def __init__(self) -> None:
        self.stmts: list[Any] = []
        self.added: list[Any] = []

    async def execute(self, stmt: Any) -> Any:
        self.stmts.append(stmt)
        empty = SimpleNamespace(all=list)
        return SimpleNamespace(scalar_one_or_none=lambda: None, scalars=lambda: empty)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        pass


@contextmanager
def _fake_db() -> Iterator[_FakeSession]:
    fake = _FakeSession()

    async def _session() -> AsyncIterator[_FakeSession]:
        yield fake

    app.dependency_overrides[get_session] = _session
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_session, None)


def test_mutation_without_a_token_is_401() -> None:
    with TestClient(app) as client:
        assert client.put("/api/settings", json={}).status_code == 401
        assert (
            client.post("/api/admin/users", json={"username": "x", "password": "y"}).status_code
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


def test_demo_admin_header_only_sees_the_demo_audit_rows() -> None:
    # audit_log has no RLS policy, so a client-asserted role must not widen it.
    with _fake_db() as db, TestClient(app) as client:
        resp = client.get("/api/audit", headers={"X-Demo-Roles": "admin"})
    assert resp.status_code == 200
    stmt = db.stmts[0]
    assert "WHERE" in str(stmt)
    assert settings.demo_username in stmt.compile().params.values()


def test_signed_admin_sees_every_audit_row() -> None:
    with _fake_db() as db, TestClient(app) as client:
        resp = client.get("/api/audit", headers=_auth("ada", ["admin"]))
    assert resp.status_code == 200
    assert "WHERE" not in str(db.stmts[0])


def test_create_user_reads_the_console_json_body() -> None:
    body = {"username": "neo", "password": "pw", "roles": "analyst"}
    with _fake_db() as db, TestClient(app) as client:
        resp = client.post("/api/admin/users", json=body, headers=_auth("ada", ["admin"]))
    assert resp.status_code == 200, resp.text
    assert resp.json()["roles"] == ["analyst"]
    assert db.added[0].username == "neo"


def test_upload_keeps_only_the_basename_and_stays_internal(monkeypatch) -> None:
    from app.api.routes import documents

    seen: dict[str, Any] = {}

    async def fake_ingest(session: Any, *, path: Any, source_id: str, **kw: Any) -> Any:
        seen.update(path=path, source_id=source_id, **kw)
        return SimpleNamespace(documents=1, chunks_inserted=0, chunks_skipped=0)

    monkeypatch.setattr(documents, "ingest_pdf", fake_ingest)
    files = {"file": ("../../evil.pdf", b"%PDF-1.4", "application/pdf")}
    with _fake_db(), TestClient(app) as client:
        resp = client.post("/api/documents/upload", files=files, headers=_auth("ada", ["admin"]))
    assert resp.status_code == 200, resp.text
    assert seen["source_id"] == "evil.pdf"
    assert seen["path"].parent == documents.UPLOAD_DIR
    # Badged internal, so a viewer must not be able to read it.
    assert seen["allowed_roles"] == ["analyst", "admin"]


def test_metrics_need_a_signed_admin_token() -> None:
    # The aggregate spans every user's audit rows, so a claimed role is not enough.
    with TestClient(app) as client:
        assert client.get("/api/metrics", headers={"X-Demo-Roles": "admin"}).status_code == 401
        assert client.get("/api/metrics", headers=_auth("vera", ["viewer"])).status_code == 403
