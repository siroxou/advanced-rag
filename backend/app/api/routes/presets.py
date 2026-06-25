"""Corpus presets endpoints (Phase 3).

List built-in datasets and trigger ingestion from the UI.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.db import get_session
from app.core.logging import get_logger
from app.ingestion.hf_dataset import ingest_hf, ingest_hf_pdfs
from app.ingestion.presets import get_preset, list_presets
from app.llm.factory import get_llm

logger = get_logger(__name__)

router = APIRouter()


@router.get("/presets")
async def list_presets_endpoint() -> list[dict[str, Any]]:
    """Return the list of available corpus presets."""
    return [
        {
            "name": p.name,
            "kind": p.kind,
            "dataset": p.dataset,
            "description": p.description,
            "roles": p.roles,
            "sensitivity": p.sensitivity,
            "default_limit": p.default_limit,
            "notes": p.notes,
        }
        for p in list_presets()
    ]


@router.post("/presets/{name}/ingest")
async def ingest_preset(
    name: str,
    limit: int = -1,
    sensitivity: str = "",
    roles: str = "",
    classify: bool = False,
) -> dict[str, Any]:
    """Ingest a corpus preset by name."""
    preset = get_preset(name)

    preset_roles = [r.strip() for r in roles.split(",") if r.strip()] if roles else preset.roles
    preset_sensitivity = sensitivity or preset.sensitivity

    if limit < 0:
        limit = preset.default_limit

    llm = get_llm() if classify else None

    async with get_session() as session:
        if preset.kind == "text":
            stats = await ingest_hf(
                session,
                dataset=preset.dataset,
                split=preset.split,
                text_column=preset.text_column,
                allowed_roles=preset_roles,
                sensitivity=preset_sensitivity,
                limit=limit,
                record_prefix=preset.record_prefix,
                classify_each=classify,
                llm=llm,
            )
        else:
            stats = await ingest_hf_pdfs(
                session,
                dataset=preset.dataset,
                split=preset.split,
                pdf_column=preset.pdf_column,
                allowed_roles=preset_roles,
                sensitivity=preset_sensitivity,
                limit=limit,
                classify_each=classify,
                llm=llm,
            )

    return {
        "status": "success",
        "preset": preset.name,
        "documents": stats.documents,
        "chunks_inserted": stats.chunks_inserted,
        "chunks_skipped": stats.chunks_skipped,
    }
