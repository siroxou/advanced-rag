"""Document governance columns: sensitivity, classification reason, auto flag.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-24

Records the access tier on the document itself, plus the auto-classifier's
rationale and whether the tier was assigned by the model or set by hand - so the
governance decision behind every document is auditable from one row.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("sensitivity", sa.Text(), nullable=False, server_default=sa.text("'internal'")),
    )
    op.add_column(
        "documents",
        sa.Column("classification_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column(
            "auto_classified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("documents", "auto_classified")
    op.drop_column("documents", "classification_reason")
    op.drop_column("documents", "sensitivity")
