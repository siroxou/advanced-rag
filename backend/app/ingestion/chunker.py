"""Recursive character chunker with overlap.

Splits on progressively finer separators (paragraph, line, word) so chunks stay
near a target size without cutting mid-word, then packs the pieces into
overlapping windows. Pure and dependency-free, which keeps it unit-testable.
"""

from __future__ import annotations

# Coarse to fine. The empty string is the hard-cut fallback for pathological
# input with no whitespace at all.
_SEPARATORS = ["\n\n", "\n", " ", ""]


def _recursive_split(text: str, separators: list[str], size: int) -> list[str]:
    if len(text) <= size:
        return [text] if text else []
    sep, *rest = separators
    if sep == "":
        return [text[i : i + size] for i in range(0, len(text), size)]
    if sep not in text:
        return _recursive_split(text, rest, size)
    out: list[str] = []
    for part in text.split(sep):
        if not part:
            continue
        if len(part) <= size:
            out.append(part)
        else:
            out.extend(_recursive_split(part, rest, size))
    return out


def _merge(pieces: list[str], size: int, overlap: int, joiner: str = " ") -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for piece in pieces:
        plen = len(piece) + len(joiner)
        if current and current_len + plen > size:
            chunks.append(joiner.join(current).strip())
            # Carry a tail of trailing pieces forward as overlap context.
            tail: list[str] = []
            tail_len = 0
            for p in reversed(current):
                if tail_len + len(p) + len(joiner) > overlap:
                    break
                tail.insert(0, p)
                tail_len += len(p) + len(joiner)
            current, current_len = tail, tail_len
        current.append(piece)
        current_len += plen
    if current:
        chunks.append(joiner.join(current).strip())
    return [c for c in chunks if c]


def chunk_text(text: str, *, size: int, overlap: int) -> list[str]:
    """Split ``text`` into overlapping chunks of roughly ``size`` characters."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    pieces = _recursive_split(text, _SEPARATORS, size)
    return _merge(pieces, size, overlap)
