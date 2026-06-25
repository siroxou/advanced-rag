"""PDF extraction tests. Skipped where PyMuPDF (the ml extra) is not installed."""

from __future__ import annotations

import pytest

fitz = pytest.importorskip("fitz")

from app.ingestion.pdf import extract_pages_from_bytes  # noqa: E402


def _one_page_pdf(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text, fontsize=11)
    data: bytes = doc.tobytes()
    doc.close()
    return data


def test_extract_pages_from_bytes_reads_text():
    pages = extract_pages_from_bytes(_one_page_pdf("Hello from an in-memory PDF"))
    assert len(pages) == 1
    assert pages[0].number == 1
    assert "Hello from an in-memory PDF" in pages[0].text


def test_extract_pages_from_bytes_skips_empty_pages():
    doc = fitz.open()
    doc.new_page()  # blank page, no text
    doc.new_page().insert_text((72, 72), "second page has text", fontsize=11)
    data = doc.tobytes()
    doc.close()

    pages = extract_pages_from_bytes(data)
    assert [p.number for p in pages] == [2]
