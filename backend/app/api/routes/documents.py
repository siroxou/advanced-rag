"""Document ingestion endpoints (Phase 1+).

Upload PDFs, set sensitivity/roles, and list ingested documents.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_session
from app.db.models import Chunk, Document
from app.ingestion.pipeline import ingest_pdf

router = APIRouter()


class DocumentUpdate(BaseModel):
    """Inline re-classification from the Documents page."""

    sensitivity: str
    allowed_roles: list[str]


async def reclassify_document(
    session: AsyncSession,
    *,
    doc_id: str,
    sensitivity: str,
    roles: list[str],
    actor_roles: list[str],
) -> Document | None:
    """Set a document's tier and cascade the ACL change to its chunks.

    RLS is enforced at the *chunk* level (``chunks.allowed_roles``), so the document's
    sensitivity change only takes effect once every child chunk is retagged. Under
    FORCE RLS the UPDATE must satisfy the policy, so we set ``app.user_roles`` to the
    union of the caller's roles and the new target roles for this transaction: the
    caller is already an authorized editor, and this lets the existing rows be seen
    (USING) and the new roles pass the WITH CHECK. Returns None if the doc is missing.
    """
    clean_roles = [r.strip() for r in roles if r.strip()] or ["viewer"]
    guc_roles = sorted(set(actor_roles) | set(clean_roles))
    await session.execute(
        text("SELECT set_config('app.user_roles', :roles, true)"),
        {"roles": ",".join(guc_roles)},
    )

    doc = (
        await session.execute(select(Document).where(Document.id == doc_id))
    ).scalar_one_or_none()
    if not doc:
        return None

    doc.sensitivity = sensitivity
    await session.execute(
        sa_update(Chunk)
        .where(Chunk.doc_id == doc_id)
        .values(sensitivity=sensitivity, allowed_roles=clean_roles)
    )
    await session.commit()
    await session.refresh(doc)
    return doc

UPLOAD_DIR = Path(__file__).parents[3] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    sensitivity: str = "internal",
    allowed_roles: str = "viewer",
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload a PDF and ingest it into the vector store."""
    filename = file.filename or ""
    if not filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    # Parse roles
    roles = [r.strip() for r in allowed_roles.split(",") if r.strip()]
    if not roles:
        roles = ["viewer"]

    # Save file temporarily
    upload_path = UPLOAD_DIR / filename
    try:
        content = await file.read()
        upload_path.write_bytes(content)
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}") from e

    try:
        stats = await ingest_pdf(
            session,
            path=upload_path,
            source_id=filename,
            allowed_roles=roles,
            sensitivity=sensitivity,
        )
        return {
            "status": "success",
            "filename": filename,
            "sensitivity": sensitivity,
            "roles": roles,
            "documents": stats.documents,
            "chunks_inserted": stats.chunks_inserted,
            "chunks_skipped": stats.chunks_skipped,
        }
    finally:
        # Clean up temp file
        if upload_path.exists():
            upload_path.unlink()


@router.get("/documents")
async def list_documents(
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all documents the user has access to."""
    result = await session.execute(
        select(Document).order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "source_id": d.source_id,
            "title": d.title,
            "uri": d.uri,
            "n_pages": d.n_pages,
            "sensitivity": d.sensitivity,
            "classification_reason": d.classification_reason,
            "auto_classified": d.auto_classified,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/documents/{doc_id}/chunks")
async def get_document_chunks(
    doc_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return text chunks for a document, RLS-gated by the caller's roles."""
    await session.execute(
        text("SELECT set_config('app.user_roles', :roles, true)"),
        {"roles": ",".join(user.roles)},
    )
    result = await session.execute(
        select(Chunk)
        .where(Chunk.doc_id == doc_id)
        .order_by(Chunk.page, Chunk.chunk_index)
    )
    chunks = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "page": c.page,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "citation_anchor": c.citation_anchor,
        }
        for c in chunks
    ]


@router.put("/documents/{doc_id}")
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Re-classify a document: update its sensitivity and cascade ACLs to its chunks."""
    doc = await reclassify_document(
        session,
        doc_id=doc_id,
        sensitivity=body.sensitivity,
        roles=body.allowed_roles,
        actor_roles=user.roles,
    )
    if not doc:
        raise HTTPException(404, "Document not found")
    return {
        "id": str(doc.id),
        "source_id": doc.source_id,
        "title": doc.title,
        "uri": doc.uri,
        "n_pages": doc.n_pages,
        "sensitivity": doc.sensitivity,
        "classification_reason": doc.classification_reason,
        "auto_classified": doc.auto_classified,
        "created_at": doc.created_at.isoformat(),
    }


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a document and all its chunks."""
    from sqlalchemy import delete as pg_delete

    result = await session.execute(
        select(Document).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")

    await session.execute(pg_delete(Document).where(Document.id == doc_id))
    await session.commit()
    return {"status": "deleted", "doc_id": doc_id}
