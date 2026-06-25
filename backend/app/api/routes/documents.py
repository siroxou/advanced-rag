"""Document ingestion endpoints (Phase 1+).

Upload PDFs, set sensitivity/roles, and list ingested documents.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.db import get_session
from app.db.models import Document
from app.ingestion.pipeline import ingest_pdf

router = APIRouter()

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
    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    # Parse roles
    roles = [r.strip() for r in allowed_roles.split(",") if r.strip()]
    if not roles:
        roles = ["viewer"]

    # Save file temporarily
    upload_path = UPLOAD_DIR / file.filename
    try:
        content = await file.read()
        upload_path.write_bytes(content)
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}")

    try:
        stats = await ingest_pdf(
            session,
            path=upload_path,
            source_id=file.filename,
            allowed_roles=roles,
            sensitivity=sensitivity,
        )
        return {
            "status": "success",
            "filename": file.filename,
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
