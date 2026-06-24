"""Auth + RLS + audit: users, audit_log, and Row-Level Security on chunks.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-24

The headline of this migration is the RLS policy. With it in place the database
itself refuses to return a chunk unless the caller's roles (set per transaction
via the ``app.user_roles`` GUC from a verified JWT) overlap the row's
``allowed_roles`` - so even a buggy or malicious application query cannot leak
unauthorized documents. FORCE makes the policy apply to the table owner too.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("roles", ARRAY(sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "audit_log",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("ts", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("roles", ARRAY(sa.Text()), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column(
            "retrieved_doc_ids",
            ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("answer_hash", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used_web", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_audit_log_ts", "audit_log", ["ts"])

    # --- Row-Level Security on chunks ------------------------------------------
    op.execute("ALTER TABLE chunks ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE chunks FORCE ROW LEVEL SECURITY")
    # Reads: only rows whose allowed_roles overlap the request's roles. When the
    # GUC is unset, current_setting(..., true) is NULL and the policy yields no
    # rows - failing closed.
    op.execute(
        """
        CREATE POLICY chunks_select ON chunks FOR SELECT
        USING (allowed_roles && string_to_array(current_setting('app.user_roles', true), ','))
        """
    )
    # Writes stay open so ingestion (which runs without a user context) works.
    # These are per-command, so they grant no read access.
    op.execute("CREATE POLICY chunks_insert ON chunks FOR INSERT WITH CHECK (true)")
    op.execute("CREATE POLICY chunks_update ON chunks FOR UPDATE USING (true) WITH CHECK (true)")
    op.execute("CREATE POLICY chunks_delete ON chunks FOR DELETE USING (true)")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS chunks_delete ON chunks")
    op.execute("DROP POLICY IF EXISTS chunks_update ON chunks")
    op.execute("DROP POLICY IF EXISTS chunks_insert ON chunks")
    op.execute("DROP POLICY IF EXISTS chunks_select ON chunks")
    op.execute("ALTER TABLE chunks NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE chunks DISABLE ROW LEVEL SECURITY")
    op.drop_table("audit_log")
    op.drop_table("users")
