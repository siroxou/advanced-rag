"""Postgres itself refuses rows the caller's roles do not cover.

This is the proof behind the project's headline claim. The counting query below
carries **no role predicate at all** - every row it fails to return was withheld
by the database's Row-Level Security policy, not by application code. That is the
difference between "we filter by role" and "the database cannot leak".

Integration test: needs Postgres, and skips cleanly when it is unreachable so the
pure-unit suite still runs without a database.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

pytestmark = pytest.mark.integration

_ZERO_VEC = "[" + ",".join(["0"] * settings.embedding_dim) + "]"

# One chunk per tier, mirroring the seeded corpus. Roles are cumulative, so a
# caller holding [viewer] sees 1 row, [viewer, analyst] 2, and all three 3.
_TIERS = [
    ("public", ["viewer", "analyst", "admin"]),
    ("internal", ["analyst", "admin"]),
    ("restricted", ["admin"]),
]

_BYPASS_HINT = (
    "The app role bypasses RLS (superuser or BYPASSRLS), so the policy is not "
    "enforced and this test cannot prove anything. Connect as the ordinary role "
    "that infra/postgres/init/01-app-role.sql creates (run it as a superuser), or "
    "recreate the volume with `docker compose down -v && make up`."
)

_INSERT_CHUNK = text(
    "INSERT INTO chunks (doc_id, source_id, content, content_hash, page, chunk_index, "
    "citation_anchor, allowed_roles, sensitivity, embedding) "
    "VALUES (:d, 'rls_test', :c, :h, 1, 0, 'rls_test p.1', :r, :s, CAST(:v AS vector))"
)


async def _set_roles(session: AsyncSession, roles: str) -> None:
    await session.execute(text("SELECT set_config('app.user_roles', :r, true)"), {"r": roles})


async def _visible(session: AsyncSession, doc_id: object) -> int:
    """How many chunks this transaction can see. No role predicate, by design."""
    result = await session.execute(
        text("SELECT count(*) FROM chunks WHERE doc_id = :d"), {"d": doc_id}
    )
    return int(result.scalar_one())


async def test_rls_hides_rows_the_caller_may_not_read():
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            pytest.skip("Postgres not reachable")

        # Checked first: a superuser sees every row whatever the policy says, so
        # without this guard the assertions below would silently stop measuring
        # the guarantee they exist to prove.
        async with Session() as s:
            is_super, bypasses = (
                await s.execute(
                    text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
                )
            ).one()
        assert not is_super and not bypasses, _BYPASS_HINT

        doc_id = None
        try:
            async with Session() as s:
                await _set_roles(s, "viewer,analyst,admin")
                doc_id = (
                    await s.execute(
                        text(
                            "INSERT INTO documents (source_id, title, sensitivity) "
                            "VALUES ('rls_test', 'rls_test', 'restricted') RETURNING id"
                        )
                    )
                ).scalar_one()
                for tier, roles in _TIERS:
                    await s.execute(
                        _INSERT_CHUNK,
                        {
                            "d": doc_id,
                            "c": f"{tier} content",
                            "h": f"rls-{tier}-{uuid.uuid4()}",
                            "r": roles,
                            "s": tier,
                            "v": _ZERO_VEC,
                        },
                    )
                await s.commit()

            for roles, expected in [
                ("viewer", 1),
                ("viewer,analyst", 2),
                ("viewer,analyst,admin", 3),
            ]:
                async with Session() as s:
                    await _set_roles(s, roles)
                    assert await _visible(s, doc_id) == expected, f"roles={roles}"

            # Fail closed: with the GUC unset current_setting(..., true) is NULL,
            # so the policy matches nothing rather than everything.
            async with Session() as s:
                assert await _visible(s, doc_id) == 0
        finally:
            if doc_id is not None:
                async with Session() as s:
                    await _set_roles(s, "viewer,analyst,admin")
                    await s.execute(text("DELETE FROM chunks WHERE doc_id = :d"), {"d": doc_id})
                    await s.execute(text("DELETE FROM documents WHERE id = :d"), {"d": doc_id})
                    await s.commit()
    finally:
        await engine.dispose()
