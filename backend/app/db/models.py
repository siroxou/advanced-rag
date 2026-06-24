"""SQLAlchemy models for the document corpus.

ACL columns live on ``chunks`` so retrieval can filter at the row level. Phase 1
enforces this with a ``WHERE allowed_roles && :roles`` predicate; Phase 2 promotes
the same columns to Postgres Row-Level Security so the database refuses
unauthorized rows even if the application query is wrong.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, Boolean, Computed, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.config import settings


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    source_id: Mapped[str] = mapped_column(Text, index=True)
    title: Mapped[str] = mapped_column(Text)
    uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    n_pages: Mapped[int] = mapped_column(default=0)
    # --- Governance audit trail ------------------------------------------------
    # The access tier and (when assigned by the auto-classifier) the rationale,
    # so "why is this admin-only?" is answerable from the row itself.
    sensitivity: Mapped[str] = mapped_column(Text, server_default=text("'internal'"))
    classification_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_classified: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    chunks: Mapped[list[Chunk]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    doc_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str] = mapped_column(Text, index=True)
    content: Mapped[str] = mapped_column(Text)
    # Stable dedupe key so re-ingesting the same corpus is idempotent.
    content_hash: Mapped[str] = mapped_column(Text, unique=True)
    page: Mapped[int] = mapped_column(default=0)
    chunk_index: Mapped[int] = mapped_column(default=0)
    citation_anchor: Mapped[str] = mapped_column(Text)

    # --- Access control (RBAC) -------------------------------------------------
    allowed_roles: Mapped[list[str]] = mapped_column(ARRAY(Text))
    allowed_groups: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default=text("'{}'::text[]")
    )
    sensitivity: Mapped[str] = mapped_column(Text, server_default=text("'internal'"))

    # --- Retrieval signals -----------------------------------------------------
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dim))
    # Generated full-text column powers the sparse half of hybrid search. Marked
    # Computed so SQLAlchemy never writes it; Postgres maintains it.
    tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('english', content)", persisted=True)
    )
    meta: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="chunks")

    __table_args__ = (
        # Approximate-NN index for dense cosine search.
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
        # GIN over the role array makes the ACL overlap predicate index-assisted.
        Index("ix_chunks_allowed_roles", "allowed_roles", postgresql_using="gin"),
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    username: Mapped[str] = mapped_column(Text, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(Text)
    roles: Mapped[list[str]] = mapped_column(ARRAY(Text))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AuditLog(Base):
    """Append-only record of every answered query (written by the app, never updated)."""

    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    ts: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    username: Mapped[str] = mapped_column(Text)
    roles: Mapped[list[str]] = mapped_column(ARRAY(Text))
    query: Mapped[str] = mapped_column(Text)
    retrieved_doc_ids: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default=text("'{}'::text[]")
    )
    answer_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int] = mapped_column(default=0)
    used_web: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
