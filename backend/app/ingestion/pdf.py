"""PDF text extraction via PyMuPDF (ships in the ``ml`` extra)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class Page:
    number: int  # 1-based, for citations
    text: str


def _pages_from_doc(doc: Any) -> list[Page]:
    pages: list[Page] = []
    for i, page in enumerate(doc, start=1):
        text = (page.get_text("text") or "").strip()
        if text:
            pages.append(Page(number=i, text=text))
    return pages


def extract_pages(path: Path) -> list[Page]:
    """Return non-empty pages with their 1-based page numbers."""
    import fitz  # PyMuPDF

    with fitz.open(path) as doc:
        return _pages_from_doc(doc)


def extract_pages_from_bytes(data: bytes) -> list[Page]:
    """Same as :func:`extract_pages`, for an in-memory PDF (e.g. a dataset row)."""
    import fitz  # PyMuPDF

    with fitz.open(stream=data, filetype="pdf") as doc:
        return _pages_from_doc(doc)
