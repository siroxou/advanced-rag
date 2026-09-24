"""Corpus presets endpoints (Phase 3).

List built-in datasets and trigger ingestion from the UI.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireAdmin, get_current_user
from app.core.db import get_session
from app.core.logging import get_logger
from app.ingestion.hf_dataset import ingest_hf, ingest_hf_pdfs
from app.ingestion.presets import get_preset, list_presets
from app.llm.factory import get_llm

logger = get_logger(__name__)

router = APIRouter()


class PresetIngestRequest(BaseModel):
    """Ingest options sent by the UI as a JSON body.

    ``limit < 0`` means "use the preset's own default"; empty ``sensitivity`` /
    ``roles`` mean "inherit the preset's tier".
    """

    limit: int = -1
    sensitivity: str = ""
    roles: str = ""
    classify: bool = False


@router.get("/presets")
async def list_presets_endpoint(
    _: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
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
    body: PresetIngestRequest | None = None,
    session: AsyncSession = Depends(get_session),
    _: CurrentUser = RequireAdmin,
) -> dict[str, Any]:
    """Ingest a corpus preset by name. Options come from the JSON request body.

    Admin-only: it downloads and embeds an entire dataset, and the caller chooses
    the ACL every resulting chunk is stored with.
    """
    opts = body or PresetIngestRequest()
    try:
        preset = get_preset(name)
    except KeyError as exc:
        raise HTTPException(404, exc.args[0]) from exc

    preset_roles = (
        [r.strip() for r in opts.roles.split(",") if r.strip()] if opts.roles else preset.roles
    )
    preset_sensitivity = opts.sensitivity or preset.sensitivity

    # Negative sentinel from the UI means "use the preset's own default" (which may
    # itself be None = ingest everything).
    resolved_limit: int | None = preset.default_limit if opts.limit < 0 else opts.limit

    classify = opts.classify
    llm = get_llm() if classify else None

    if preset.kind == "text":
        stats = await ingest_hf(
            session,
            dataset=preset.dataset,
            split=preset.split,
            text_column=preset.text_column,
            allowed_roles=preset_roles,
            sensitivity=preset_sensitivity,
            limit=resolved_limit,
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
            limit=resolved_limit,
            classify_each=classify,
            llm=llm,
        )

    await session.commit()
    return {
        "status": "success",
        "preset": preset.name,
        "documents": stats.documents,
        "chunks_inserted": stats.chunks_inserted,
        "chunks_skipped": stats.chunks_skipped,
    }
