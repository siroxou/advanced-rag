"""Ingest a HuggingFace text dataset into the corpus.

Some corpora ship as dataset rows rather than PDFs (e.g. medical patient-doctor
Q&A). This reads a text column and feeds each record through the same chunk ->
embed -> RLS-tagged upsert core as PDF ingestion, so retrieval, RBAC, and
citations behave identically.

Two row shapes are supported:

* **one record per row** (default) - each row is a complete document.
* **line-delimited** (``record_prefix`` set) - each row is a single line and a
  new record begins whenever a line starts with the given prefix. The
  Postzeun/Patient-Doctor set is line-delimited: every conversation opens with
  "This is a conversation between a patient and a doctor", so without grouping
  each row would become a useless few-character chunk.

Rows stream, so ``limit`` stops early instead of materialising the whole set.
"""

from __future__ import annotations

import itertools
from collections.abc import Iterable, Iterator, Mapping
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingestion.classifier import classify
from app.ingestion.pdf import extract_pages_from_bytes
from app.ingestion.pipeline import IngestStats, ingest_sections
from app.llm.base import LLMProvider

logger = get_logger(__name__)


def _slug(dataset: str) -> str:
    return dataset.rstrip("/").split("/")[-1].lower()


def select_texts(rows: Iterable[Mapping[str, Any]], *, text_column: str) -> Iterator[str]:
    """Yield non-empty, stripped text from each dataset row."""
    for row in rows:
        value = row.get(text_column)
        if not isinstance(value, str):
            continue
        text = value.strip()
        if text:
            yield text


def group_records(texts: Iterable[str], *, record_prefix: str | None) -> Iterator[str]:
    """Group lines into records.

    With no ``record_prefix`` each line is its own record. Otherwise consecutive
    lines accumulate into one record and a new record starts when a line begins
    with the prefix - reconstructing multi-line documents from a line-delimited
    dataset.
    """
    if record_prefix is None:
        yield from texts
        return

    buffer: list[str] = []
    for text in texts:
        if text.startswith(record_prefix) and buffer:
            yield "\n".join(buffer)
            buffer = []
        buffer.append(text)
    if buffer:
        yield "\n".join(buffer)


def _load_rows(dataset: str, split: str, *, streaming: bool) -> Iterable[Mapping[str, Any]]:
    # Imported lazily so the lightweight (non-ml) install does not need `datasets`.
    from datasets import load_dataset

    return load_dataset(dataset, split=split, streaming=streaming)


async def ingest_hf(
    session: AsyncSession,
    *,
    dataset: str,
    split: str = "train",
    text_column: str = "text",
    source_id: str | None = None,
    allowed_roles: list[str],
    sensitivity: str = "internal",
    limit: int | None = 500,
    record_prefix: str | None = None,
    streaming: bool = True,
    classify_each: bool = False,
    llm: LLMProvider | None = None,
) -> IngestStats:
    """Stream a HuggingFace dataset into the corpus. Returns aggregate stats."""
    source = source_id or _slug(dataset)
    slug = _slug(dataset)
    texts = select_texts(_load_rows(dataset, split, streaming=streaming), text_column=text_column)
    records = group_records(texts, record_prefix=record_prefix)
    if limit is not None:
        records = itertools.islice(records, limit)

    total = IngestStats()
    for i, text in enumerate(records):
        roles, tier, reason, auto = allowed_roles, sensitivity, None, False
        if classify_each and llm is not None:
            c = await classify(llm, text)
            roles, tier, reason, auto = c.allowed_roles, c.sensitivity, c.reason, True

        stats = await ingest_sections(
            session,
            source_id=source,
            title=f"{slug}-{i}",
            uri=f"hf://{dataset}#{i}",
            sections=[(1, text)],
            allowed_roles=roles,
            sensitivity=tier,
            classification_reason=reason,
            auto_classified=auto,
            paged=False,
            meta={"dataset": dataset, "row": i},
        )
        total.documents += stats.documents
        total.chunks_inserted += stats.chunks_inserted
        total.chunks_skipped += stats.chunks_skipped

    logger.info(
        "hf_ingested",
        dataset=dataset,
        documents=total.documents,
        chunks_inserted=total.chunks_inserted,
    )
    return total


def _pdf_blob(cell: Any) -> tuple[bytes | None, str | None]:
    """Return ``(pdf_bytes, label)`` from a HuggingFace ``Pdf(decode=False)`` cell.

    Bytes are either inline or behind an fsspec path (datasets often zip the PDFs
    in the repo). When the path carries a top folder it is the document's domain
    (e.g. ``ARXIV-AI``/``ECB``/``OCDE``), which we recover as the label - more
    reliable than the dataset's own ClassLabel, which can be misconfigured.
    """
    if isinstance(cell, bytes):
        return cell, None
    if not isinstance(cell, Mapping):
        return None, None

    data = cell.get("bytes")
    path = cell.get("path")
    label: str | None = None
    if isinstance(path, str) and "://" in path:
        inner = path.split("://", 1)[1].split("::", 1)[0].strip("/")
        parts = inner.split("/")
        if len(parts) >= 2:
            label = parts[0]
    if not isinstance(data, bytes) and isinstance(path, str):
        import fsspec

        with fsspec.open(path, "rb") as fh:
            data = fh.read()
    return (data if isinstance(data, bytes) else None), label


async def ingest_hf_pdfs(
    session: AsyncSession,
    *,
    dataset: str,
    split: str = "train",
    pdf_column: str = "pdf",
    source_id: str | None = None,
    allowed_roles: list[str],
    sensitivity: str = "internal",
    limit: int | None = None,
    classify_each: bool = False,
    llm: LLMProvider | None = None,
) -> IngestStats:
    """Ingest a HuggingFace dataset whose rows carry PDF files (not text)."""
    import datasets

    # drop_labels avoids a misconfigured ClassLabel crashing the load; the real
    # domain label is recovered from each PDF's path instead (see _pdf_blob).
    try:
        ds = datasets.load_dataset(dataset, split=split, drop_labels=True)
    except (TypeError, ValueError):
        ds = datasets.load_dataset(dataset, split=split)
    try:
        # decode=False hands us the path/bytes; PyMuPDF reads the bytes directly.
        ds = ds.cast_column(pdf_column, datasets.Pdf(decode=False))
    except Exception:  # column already raw bytes, or not a Pdf feature
        logger.warning("hf_pdf_cast_skipped", dataset=dataset)

    source = source_id or _slug(dataset)
    slug = _slug(dataset)
    total = IngestStats()
    for i, row in enumerate(ds):
        if limit is not None and i >= limit:
            break
        data, label = _pdf_blob(row.get(pdf_column))
        if not data:
            continue
        pages = extract_pages_from_bytes(data)
        if not pages:
            continue

        roles, tier, reason, auto = allowed_roles, sensitivity, None, False
        if classify_each and llm is not None:
            c = await classify(llm, "\n\n".join(p.text for p in pages))
            roles, tier, reason, auto = c.allowed_roles, c.sensitivity, c.reason, True

        stats = await ingest_sections(
            session,
            source_id=source,
            title=f"{slug}-{i}",
            uri=f"hf://{dataset}#{i}",
            sections=[(p.number, p.text) for p in pages],
            allowed_roles=roles,
            sensitivity=tier,
            classification_reason=reason,
            auto_classified=auto,
            paged=True,
            meta={"dataset": dataset, "row": i, "label": label},
        )
        total.documents += stats.documents
        total.chunks_inserted += stats.chunks_inserted
        total.chunks_skipped += stats.chunks_skipped

    logger.info(
        "hf_pdf_ingested",
        dataset=dataset,
        documents=total.documents,
        chunks_inserted=total.chunks_inserted,
    )
    return total
