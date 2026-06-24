"""Initial corpus schema: documents + chunks with pgvector and ACL columns.

Revision ID: 0001
Revises:
Create Date: 2026-06-23
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID

from alembic import op
from app.core.config import settings

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "documents",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("uri", sa.Text(), nullable=True),
        sa.Column("n_pages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_documents_source_id", "documents", ["source_id"])

    op.create_table(
        "chunks",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "doc_id",
            UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("page", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("citation_anchor", sa.Text(), nullable=False),
        sa.Column("allowed_roles", ARRAY(sa.Text()), nullable=False),
        sa.Column(
            "allowed_groups",
            ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("sensitivity", sa.Text(), nullable=False, server_default=sa.text("'internal'")),
        sa.Column("embedding", Vector(settings.embedding_dim), nullable=False),
        sa.Column(
            "tsv",
            TSVECTOR(),
            sa.Computed("to_tsvector('english', content)", persisted=True),
            nullable=False,
        ),
        sa.Column("metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chunks_doc_id", "chunks", ["doc_id"])
    op.create_index("ix_chunks_source_id", "chunks", ["source_id"])
    # Sparse half of hybrid search.
    op.create_index("ix_chunks_tsv", "chunks", ["tsv"], postgresql_using="gin")
    # ACL overlap predicate (allowed_roles && :roles) becomes index-assisted.
    op.create_index("ix_chunks_allowed_roles", "chunks", ["allowed_roles"], postgresql_using="gin")
    # Approximate-NN index for dense cosine search.
    op.create_index(
        "ix_chunks_embedding_hnsw",
        "chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_table("chunks")
    op.drop_table("documents")
