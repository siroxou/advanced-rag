"""Async SQLAlchemy engine and session factory.

The application boots even when Postgres is unreachable; ``/api/health`` reports
connectivity and only the ingestion/retrieval paths require a live connection.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# create_async_engine does not open a connection until first use, so importing
# this module is safe with the database down.
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    echo=False,
)

SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields a request-scoped session."""
    async with SessionFactory() as session:
        yield session


async def db_reachable() -> bool:
    """Best-effort connectivity probe used by the health endpoint."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
