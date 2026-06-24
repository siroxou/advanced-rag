"""Append-only audit logging of answered queries.

Writes through its own short-lived session (owner role) so the audit trail is
independent of the request's RLS-scoped retrieval transaction. Only the answer's
hash is stored, never the answer text.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence

from app.core.db import SessionFactory
from app.core.logging import get_logger
from app.db.models import AuditLog

logger = get_logger(__name__)


async def write_audit(
    *,
    username: str,
    roles: Sequence[str],
    query: str,
    retrieved_doc_ids: Sequence[str],
    answer: str,
    latency_ms: int,
    used_web: bool = False,
) -> None:
    answer_hash = hashlib.sha256(answer.encode("utf-8")).hexdigest() if answer else None
    try:
        async with SessionFactory() as session:
            session.add(
                AuditLog(
                    username=username,
                    roles=list(roles),
                    query=query,
                    retrieved_doc_ids=list(retrieved_doc_ids),
                    answer_hash=answer_hash,
                    latency_ms=latency_ms,
                    used_web=used_web,
                )
            )
            await session.commit()
    except Exception:  # auditing must never break the user-facing response
        logger.warning("audit_write_failed", username=username, exc_info=True)
