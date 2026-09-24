"""FastAPI application entrypoint."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import INSECURE_JWT_SECRET, settings
from app.core.logging import configure_logging, get_logger
from app.core.ratelimit import RateLimitMiddleware
from app.core.runtime_settings import runtime

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)
    # Anyone can mint an admin token with the public default secret, so only
    # tolerate it on a developer machine.
    if settings.jwt_secret == INSECURE_JWT_SECRET:
        if settings.environment != "local":
            raise RuntimeError("JWT_SECRET is the public dev default; set a real one")
        logger.warning("insecure_jwt_secret", hint="fine on localhost, never deploy it")
    # Load operator overrides from the DB so the running config reflects any
    # Settings-page changes made in a previous session. Fails soft if the DB is down.
    await runtime.load()
    logger.info(
        "startup",
        app=settings.app_name,
        environment=settings.environment,
        llm_provider=runtime.get_llm_provider(),
        llm_model=runtime.get_llm_model(),
    )
    yield
    logger.info("shutdown")


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    # Rate limit added before CORS so CORS stays outermost and its headers wrap
    # the 429 too (the browser needs them to read a cross-origin rejection).
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
