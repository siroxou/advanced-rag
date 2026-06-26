"""Audit log endpoints (Phase 6).

Append-only query history with filtering.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_session
from app.db.models import AuditLog

router = APIRouter()


@router.get("/audit")
async def get_audit_log(
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve audit log entries, filtered by user visibility."""
    query = select(AuditLog).order_by(AuditLog.ts.desc())

    # Non-admins only see their own logs
    if "admin" not in user.roles:
        query = query.where(AuditLog.username == user.username)

    result = await session.execute(query.offset(offset).limit(limit))
    logs = result.scalars().all()

    return {
        "total": len(logs),
        "entries": [
            {
                "id": str(log.id),
                "ts": log.ts.isoformat(),
                "username": log.username,
                "roles": log.roles,
                "query": log.query,
                "retrieved_doc_ids": log.retrieved_doc_ids,
                "latency_ms": log.latency_ms,
                "used_web": log.used_web,
            }
            for log in logs
        ],
    }
