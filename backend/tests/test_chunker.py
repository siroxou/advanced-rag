"""Unit tests for the recursive chunker (pure, no DB or model)."""

from __future__ import annotations

from app.ingestion.chunker import chunk_text


def test_empty_text_yields_no_chunks():
    assert chunk_text("", size=100, overlap=10) == []
    assert chunk_text("   \n  ", size=100, overlap=10) == []


def test_short_text_is_one_chunk():
    assert chunk_text("hello world", size=100, overlap=10) == ["hello world"]


def test_large_text_splits_with_bounded_size():
    text = " ".join(f"word{i}" for i in range(500))
    chunks = chunk_text(text, size=200, overlap=40)
    assert len(chunks) > 1
    # Each chunk stays within target plus the carried overlap.
    assert all(len(c) <= 200 + 40 for c in chunks)


def test_no_word_is_split_across_chunks():
    text = " ".join(f"word{i}" for i in range(500))
    chunks = chunk_text(text, size=200, overlap=40)
    joined = " ".join(chunks)
    for i in (0, 123, 250, 499):
        assert f"word{i}" in joined


def test_overlap_shares_content_between_neighbors():
    text = " ".join(f"token{i}" for i in range(300))
    chunks = chunk_text(text, size=150, overlap=60)
    # With overlap, the tail of one chunk reappears at the head of the next.
    first_tail = chunks[0].split()[-1]
    assert first_tail in chunks[1]
