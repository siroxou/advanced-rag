"""Top-level API router; mounted under /api in app.main."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import admin, auth, audit, chat, documents, health, presets

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(documents.router, tags=["documents"])
api_router.include_router(presets.router, tags=["presets"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(audit.router, tags=["audit"])
