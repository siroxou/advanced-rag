"""Metrics aggregation over the audit log (Phase 6 observability).

Admin-only, behind a signed token (``RequireAdmin``): ``audit_log`` has no RLS
policy, so a client-asserted demo role must never reach it. Aggregates the
append-only ``audit_log`` (the metrics spine) into the numbers the /metrics
dashboard renders - deliberately P50/P95 latency rather than a
mean (averages hide the worst case), plus cost/request, citation coverage, and
failure rate. Pure SQL, no new storage: ``percentile_cont`` and ``avg`` do the work,
and NULLs (e.g. cost on a local/free model) are simply skipped by ``avg``.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireAdmin
from app.core.db import get_session

router = APIRouter()

_BUCKETS = {"hour", "day", "week"}
_WINDOW_RE = re.compile(r"^(\d+)([hdw])$")
_UNITS = {"h": "hours", "d": "days", "w": "weeks"}

# The aggregate columns, shared by the per-bucket series and the overall summary.
# grounding_ok / success are nullable booleans: ::int turns them into 1/0 and avg()
# skips the NULLs, so coverage/failure-rate are measured only over rows that have
# the signal. Coverage needs at least one [n] as well as no invalid one, because
# grounding_ok alone is true for an answer that cites nothing (and for every answer
# while the grounding guardrail is off). cost_usd NULLs (free/local models) drop out
# of the cost average too.
_AGG = """
    count(*) AS n,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
    avg(cost_usd) AS avg_cost_usd,
    avg((grounding_ok AND n_citations > 0)::int)::float AS citation_coverage,
    1 - avg(success::int)::float AS failure_rate
"""

# Bound as text and cast in SQL: asyncpg encodes a parameter Postgres types as
# interval with its binary codec, which needs a timedelta, not "7 days".
_SINCE = "ts >= now() - CAST(:interval AS text)::interval"


def _interval(window: str) -> str:
    """Map an API window like ``7d`` / ``24h`` / ``2w`` to a Postgres interval string.

    Validated here because the result is interpolated into SQL: only ``\\d+[hdw]``
    is accepted, everything else is a 422.
    """
    m = _WINDOW_RE.match(window)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="window must look like 24h, 7d, or 2w",
        )
    return f"{m.group(1)} {_UNITS[m.group(2)]}"


def _f(value: Any) -> float | None:
    """Coerce a numeric SQL result (or None) to a float for JSON."""
    return None if value is None else float(value)


def _metrics(row: Any) -> dict[str, Any]:
    return {
        "n": int(row["n"]),
        "p50_ms": _f(row["p50_ms"]),
        "p95_ms": _f(row["p95_ms"]),
        "avg_cost_usd": _f(row["avg_cost_usd"]),
        "citation_coverage": _f(row["citation_coverage"]),
        "failure_rate": _f(row["failure_rate"]),
    }


@router.get("/metrics")
async def get_metrics(
    window: str = "7d",
    bucket: str = "day",
    session: AsyncSession = Depends(get_session),
    _: CurrentUser = RequireAdmin,
) -> dict[str, Any]:
    """Per-bucket time series + overall summary of request quality/latency/cost."""
    if bucket not in _BUCKETS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"bucket must be one of {sorted(_BUCKETS)}",
        )
    interval = _interval(window)
    params = {"bucket": bucket, "interval": interval}

    series_sql = text(
        f"SELECT date_trunc(:bucket, ts) AS bucket, {_AGG} "
        f"FROM audit_log WHERE {_SINCE} GROUP BY 1 ORDER BY 1"
    )
    overall_sql = text(f"SELECT {_AGG} FROM audit_log WHERE {_SINCE}")

    series = (await session.execute(series_sql, params)).mappings().all()
    overall = (await session.execute(overall_sql, {"interval": interval})).mappings().one()

    return {
        "window": window,
        "bucket": bucket,
        "overall": _metrics(overall),
        "series": [{"bucket": r["bucket"].isoformat(), **_metrics(r)} for r in series],
    }


if __name__ == "__main__":  # self-check: the window string flows into SQL
    assert _interval("7d") == "7 days"
    assert _interval("24h") == "24 hours"
    assert _interval("2w") == "2 weeks"
    for bad in ("7", "d7", "7x", "7 days", "; drop table audit_log"):
        try:
            _interval(bad)
        except HTTPException:
            pass
        else:
            raise AssertionError(f"expected rejection for {bad!r}")
    print("metrics window-parser self-check ok")
