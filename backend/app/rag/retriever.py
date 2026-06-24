"""Hybrid retrieval: dense + sparse fused with RRF, then cross-encoder rerank.

Both first-stage retrievers run in a single SQL statement:

* dense  - pgvector cosine nearest neighbours over the HNSW index
* sparse - Postgres full-text ``ts_rank_cd`` over the GIN index

Their rankings are combined with Reciprocal Rank Fusion (RRF), which needs no
score calibration between the two very different scales. The fused candidate
pool is then reranked by a BGE cross-encoder for final precision.

RBAC is enforced in the ``WHERE allowed_roles && :roles`` predicate on *both*
arms, so a caller can never be ranked against rows they are not cleared for.
Phase 2 moves this same predicate into a Postgres Row-Level Security policy.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import Text, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.rag.embedder import get_embedder
from app.rag.reranker import get_reranker


@dataclass(slots=True)
class RetrievedChunk:
    id: str
    doc_id: str
    source_id: str
    content: str
    page: int
    citation_anchor: str
    score: float  # cross-encoder relevance


_HYBRID_SQL = text(
    """
    WITH dense AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> (:qvec)::vector) AS rnk
        FROM chunks
        WHERE allowed_roles && :roles
        ORDER BY embedding <=> (:qvec)::vector
        LIMIT :candidates
    ),
    sparse AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS rnk
        FROM chunks, plainto_tsquery('english', :q) AS q
        WHERE tsv @@ q AND allowed_roles && :roles
        ORDER BY ts_rank_cd(tsv, q) DESC
        LIMIT :candidates
    ),
    fused AS (
        SELECT COALESCE(d.id, s.id) AS id,
               COALESCE(1.0 / (:rrf_k + d.rnk), 0.0)
             + COALESCE(1.0 / (:rrf_k + s.rnk), 0.0) AS rrf
        FROM dense d
        FULL OUTER JOIN sparse s ON d.id = s.id
    )
    SELECT c.id, c.doc_id, c.source_id, c.content, c.page, c.citation_anchor, f.rrf
    FROM fused f
    JOIN chunks c ON c.id = f.id
    ORDER BY f.rrf DESC
    LIMIT :candidates
    """
).bindparams(bindparam("roles", type_=ARRAY(Text)))


async def retrieve(
    session: AsyncSession,
    query: str,
    roles: list[str],
    *,
    candidates: int | None = None,
    top_k: int | None = None,
) -> list[RetrievedChunk]:
    """Return the top reranked chunks the given roles are allowed to see."""
    candidates = candidates or settings.retrieval_candidates
    top_k = top_k or settings.retrieval_top_k

    qvec = get_embedder().encode_one(query)
    qvec_str = "[" + ",".join(f"{x:.7f}" for x in qvec) + "]"

    # Push the caller's roles into the RLS policy for this transaction. Even if the
    # query below forgot its ACL predicate, Postgres would still refuse rows whose
    # allowed_roles do not overlap these (see migration 0002, ADR-0006).
    await session.execute(
        text("SELECT set_config('app.user_roles', :roles, true)"),
        {"roles": ",".join(roles)},
    )

    result = await session.execute(
        _HYBRID_SQL,
        {
            "qvec": qvec_str,
            "q": query,
            "roles": roles,
            "candidates": candidates,
            "rrf_k": settings.rrf_k,
        },
    )
    rows = result.all()
    if not rows:
        return []

    scores = get_reranker().score(query, [r.content for r in rows])
    ranked = sorted(zip(rows, scores, strict=True), key=lambda t: t[1], reverse=True)[:top_k]
    return [
        RetrievedChunk(
            id=str(r.id),
            doc_id=str(r.doc_id),
            source_id=r.source_id,
            content=r.content,
            page=r.page,
            citation_anchor=r.citation_anchor,
            score=float(s),
        )
        for r, s in ranked
    ]
