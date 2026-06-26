"""Runtime settings store: a key-value table overlaying the env defaults.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-25

Holds operator-set overrides (selected model, BYO API key, guardrail toggles,
rate-limit config) so the running app can be reconfigured without a restart. The
app still boots from env defaults; rows here win when present. Not under RLS - it
is operational config, not user data.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
