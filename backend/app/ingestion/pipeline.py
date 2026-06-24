"""Ingestion pipeline: PDF -> chunks -> embeddings -> Postgres rows.

Idempotent. Each chunk carries a content hash; re-running over the same corpus
inserts only new material and skips the rest, so ingestion is safe to repeat.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from sqlalchemy import Table
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.db.models import Chunk, Document
from app.ingestion.chunker import chunk_text
from app.ingestion.pdf import extract_pages
from app.rag.embedder import get_embedder

logger = get_logger(__name__)


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

    title = path.stem

    # (page_number, chunk_index, text) units across the whole document.
    units: list[tuple[int, int, str]] = []
    idx = 0
    for page in pages:
        for piece in chunk_text(
            page.text, size=settings.chunk_chars, overlap=settings.chunk_overlap
        ):
            units.append((page.number, idx, piece))
            idx += 1
    if not units:
        return IngestStats()

    vectors = get_embedder().encode([u[2] for u in units])

    doc = Document(
        source_id=source_id,
        title=title,
        uri=str(path),
        n_pages=len(pages),
        sensitivity=sensitivity,
        classification_reason=classification_reason,
        auto_classified=auto_classified,
    )
    session.add(doc)
    await session.flush()  # populate doc.id

    inserted = 0
    skipped = 0
    table = cast(Table, Chunk.__table__)
    for (page_no, chunk_idx, text_piece), vec in zip(units, vectors, strict=True):
        stmt = (
            pg_insert(table)
            .values(
                doc_id=doc.id,
                source_id=source_id,
                content=text_piece,
                content_hash=_content_hash(source_id, title, text_piece),
                page=page_no,
                chunk_index=chunk_idx,
                citation_anchor=f"{title} p.{page_no}",
                allowed_roles=allowed_roles,
                sensitivity=sensitivity,
                embedding=vec,
                metadata={"file": path.name},
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
        file=path.name,
        pages=len(pages),
        chunks_inserted=inserted,
        chunks_skipped=skipped,
        roles=allowed_roles,
    )
    return IngestStats(
        documents=1 if inserted else 0,
        chunks_inserted=inserted,
        chunks_skipped=skipped,
    )
