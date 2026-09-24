"""GET /api/metrics against a real Postgres, so the aggregate SQL actually runs.

The unit suite only checks the auth gate; a query that Postgres or the driver
rejects would otherwise ship as a 500 on every call.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.security.tokens import create_access_token

pytestmark = pytest.mark.integration


def test_metrics_aggregate_runs_against_postgres() -> None:
    auth = {"Authorization": f"Bearer {create_access_token('ada', ['admin'])}"}
    with TestClient(app) as client:
        resp = client.get("/api/metrics?window=7d&bucket=day", headers=auth)
    assert resp.status_code == 200, resp.text
    assert {"n", "p95_ms", "citation_coverage", "failure_rate"} <= set(resp.json()["overall"])
