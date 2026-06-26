"""Ingestion pipeline: source text -> chunks -> embeddings -> Postgres rows.

``ingest_sections`` is the shared core (chunk, embed, RLS-tagged upsert, commit);
``ingest_pdf`` and the HuggingFace dataset ingester both feed it. Idempotent:
each chunk carries a content hash, so re-running over the same corpus inserts
only new material and skips the rest.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from sqlalchemy import Table, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.db.models import Chunk, Document
from app.ingestion.chunker import chunk_text
from app.ingestion.pdf import extract_pages
from app.rag.embedder import get_embedder

logger = get_logger(__name__)

# One section of a source document: a 1-based ordinal (a PDF page, or 1 for an
# unpaged record) and its text.
Section = tuple[int, str]


@dataclass(slots=True)
class IngestStats:
    documents: int = 0
    chunks_inserted: int = 0
    chunks_skipped: int = 0


def _content_hash(source_id: str, title: str, content: str) -> str:
    h = hashlib.sha256()
    for part in (source_id, title, content):
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


async def ingest_sections(
    session: AsyncSession,
    *,
    source_id: str,
    title: str,
    uri: str | None,
    sections: list[Section],
    allowed_roles: list[str],
    sensitivity: str = "internal",
    classification_reason: str | None = None,
    auto_classified: bool = False,
    paged: bool = True,
    meta: dict[str, Any] | None = None,
) -> IngestStats:
    """Chunk, embed, and upsert one document's sections, then commit."""
    # (ordinal, chunk_index, text) units across the whole document.
    units: list[tuple[int, int, str]] = []
    idx = 0
    for ordinal, sec_text in sections:
        for piece in chunk_text(
            sec_text, size=settings.chunk_chars, overlap=settings.chunk_overlap
        ):
            units.append((ordinal, idx, piece))
            idx += 1
    if not units:
        return IngestStats()

    vectors = get_embedder().encode([u[2] for u in units])

    # ``chunks`` runs under FORCE row-level security, so the INSERT ... RETURNING
    # below must also satisfy the SELECT policy to read the new id back. Push this
    # document's own roles into the per-transaction GUC the policy reads (the same
    # mechanism the retriever uses), so the just-written rows are visible to the
    # ingesting transaction. Without it every insert fails closed.
    await session.execute(
        text("SELECT set_config('app.user_roles', :roles, true)"),
        {"roles": ",".join(allowed_roles)},
    )

    doc = Document(
        source_id=source_id,
        title=title,
        uri=uri,
        n_pages=len(sections),
        sensitivity=sensitivity,
        classification_reason=classification_reason,
        auto_classified=auto_classified,
    )
    session.add(doc)
    await session.flush()  # populate doc.id

    inserted = 0
    skipped = 0
    table = cast(Table, Chunk.__table__)
    for (ordinal, chunk_idx, text_piece), vec in zip(units, vectors, strict=True):
        anchor = f"{title} p.{ordinal}" if paged else title
        stmt = (
            pg_insert(table)
            .values(
                doc_id=doc.id,
                source_id=source_id,
                content=text_piece,
                content_hash=_content_hash(source_id, title, text_piece),
                page=ordinal,
                chunk_index=chunk_idx,
                citation_anchor=anchor,
                allowed_roles=allowed_roles,
                sensitivity=sensitivity,
                embedding=vec,
                metadata=meta or {},
            )
            .on_conflict_do_nothing(index_elements=["content_hash"])
            .returning(table.c.id)
        )
        result = await session.execute(stmt)
        if result.scalar_one_or_none() is not None:
            inserted += 1
        else:
            skipped += 1

    if inserted == 0:
        # Nothing new; do not leave an orphan document row behind.
        await session.delete(doc)

    await session.commit()
    logger.info(
        "ingested",
        title=title,
        sections=len(sections),
        chunks_inserted=inserted,
        chunks_skipped=skipped,
        roles=allowed_roles,
    )
    return IngestStats(
        documents=1 if inserted else 0,
        chunks_inserted=inserted,
        chunks_skipped=skipped,
    )


async def ingest_pdf(
    session: AsyncSession,
    path: Path,
    *,
    source_id: str,
    allowed_roles: list[str],
    sensitivity: str = "internal",
    classification_reason: str | None = None,
    auto_classified: bool = False,
) -> IngestStats:
    """Ingest one PDF and commit. Returns per-file stats."""
    pages = extract_pages(path)
    if not pages:
        logger.warning("empty_pdf", path=str(path))
        return IngestStats()

    return await ingest_sections(
        session,
        source_id=source_id,
        title=path.stem,
        uri=str(path),
        sections=[(p.number, p.text) for p in pages],
        allowed_roles=allowed_roles,
        sensitivity=sensitivity,
        classification_reason=classification_reason,
        auto_classified=auto_classified,
        paged=True,
        meta={"file": path.name},
    )
