"""Re-classifying a document cascades the ACL change to its chunks (RLS-correct).

Integration test: needs Postgres. Skips cleanly when the DB is unreachable so the
pure-unit suite still runs in CI without a database.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.routes.documents import reclassify_document
from app.core.config import settings

_ZERO_VEC = "[" + ",".join(["0"] * settings.embedding_dim) + "]"


async def test_reclassify_cascades_to_chunk_acls():
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            pytest.skip("Postgres not reachable")

        doc_id = None
        try:
            # Seed a doc + one internal chunk (admin/analyst readable).
            async with Session() as s:
                await s.execute(text("SELECT set_config('app.user_roles', 'admin', true)"))
                doc_id = (
                    await s.execute(
                        text(
                            "INSERT INTO documents (source_id, title, sensitivity) "
                            "VALUES ('t_src', 't_title', 'internal') RETURNING id"
                        )
                    )
                ).scalar_one()
                await s.execute(
                    text(
                        "INSERT INTO chunks (doc_id, source_id, content, content_hash, page, "
                        "chunk_index, citation_anchor, allowed_roles, sensitivity, embedding) "
                        "VALUES (:d, 't_src', 'hello', :h, 1, 0, 't p.1', "
                        "ARRAY['analyst','admin'], 'internal', CAST(:v AS vector))"
                    ),
                    {"d": doc_id, "h": f"testhash-{doc_id}", "v": _ZERO_VEC},
                )
                await s.commit()

            # Re-classify to restricted (admin-only).
            async with Session() as s:
                updated = await reclassify_document(
                    s,
                    doc_id=str(doc_id),
                    sensitivity="restricted",
                    roles=["admin"],
                    actor_roles=["viewer", "analyst", "admin"],
                )
                assert updated is not None
                assert updated.sensitivity == "restricted"

            # The chunk ACL must now be admin-only - this is what RLS actually reads.
            async with Session() as s:
                await s.execute(text("SELECT set_config('app.user_roles', 'admin', true)"))
                roles = (
                    await s.execute(
                        text("SELECT DISTINCT allowed_roles FROM chunks WHERE doc_id = :d"),
                        {"d": doc_id},
                    )
                ).scalar_one()
                assert roles == ["admin"]
        finally:
            if doc_id is not None:
                async with Session() as s:
                    await s.execute(text("SELECT set_config('app.user_roles', 'admin', true)"))
                    await s.execute(text("DELETE FROM chunks WHERE doc_id = :d"), {"d": doc_id})
                    await s.execute(text("DELETE FROM documents WHERE id = :d"), {"d": doc_id})
                    await s.commit()
    finally:
        await engine.dispose()
