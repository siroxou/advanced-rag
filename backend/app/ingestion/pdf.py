"""PDF text extraction via PyMuPDF (ships in the ``ml`` extra)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Page:
    number: int  # 1-based, for citations
    text: str


def extract_pages(path: Path) -> list[Page]:
    """Return non-empty pages with their 1-based page numbers."""
    import fitz  # PyMuPDF

    pages: list[Page] = []
    with fitz.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            text = (page.get_text("text") or "").strip()
            if text:
                pages.append(Page(number=i, text=text))
    return pages
