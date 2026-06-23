"""Liveness + dependency health."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.llm.factory import get_llm

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    environment: str
    llm_provider: str
    llm_model: str
    llm_reachable: bool


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    reachable = await get_llm().health()
    return HealthResponse(
        status="ok",
        environment=settings.environment,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        llm_reachable=reachable,
    )
