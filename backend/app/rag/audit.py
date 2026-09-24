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
    # --- Metrics spine (Phase 6); all optional, best-effort ---------------------
    model: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    cost_usd: float | None = None,
    grounding_ok: bool | None = None,
    n_citations: int | None = None,
    success: bool | None = None,
    failure_reason: str | None = None,
    retrieval_ms: int | None = None,
    generation_ms: int | None = None,
    prompt_version: str | None = None,
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
                    model=model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cost_usd=cost_usd,
                    grounding_ok=grounding_ok,
                    n_citations=n_citations,
                    success=success,
                    failure_reason=failure_reason,
                    retrieval_ms=retrieval_ms,
                    generation_ms=generation_ms,
                    prompt_version=prompt_version,
                )
            )
            await session.commit()
    except Exception:  # auditing must never break the user-facing response
        logger.warning("audit_write_failed", username=username, exc_info=True)
