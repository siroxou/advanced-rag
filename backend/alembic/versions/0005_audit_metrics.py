"""Extend audit_log into a metrics store.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-29

Adds nullable per-request metrics columns to ``audit_log`` so the append-only audit
trail doubles as the metrics spine behind the /metrics dashboard: model, token usage,
estimated cost, grounding/citation signals, success/failure, and per-step latency.
Everything is nullable - existing rows and the no-RAG / blocked paths just leave the
new columns unset, so this migration is safe to apply to a populated table.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (name, type) for each nullable metrics column added to audit_log.
_COLUMNS = (
    ("model", sa.Text()),
    ("prompt_tokens", sa.Integer()),
    ("completion_tokens", sa.Integer()),
    ("cost_usd", sa.Float()),
    ("grounding_ok", sa.Boolean()),
    ("n_citations", sa.Integer()),
    ("success", sa.Boolean()),
    ("failure_reason", sa.Text()),
    ("retrieval_ms", sa.Integer()),
    ("generation_ms", sa.Integer()),
    ("prompt_version", sa.Text()),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("audit_log", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _type in reversed(_COLUMNS):
        op.drop_column("audit_log", name)
