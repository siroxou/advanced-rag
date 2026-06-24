"""Grounded RAG synthesis.

Builds a prompt that forces inline ``[n]`` citations and a faithful refusal when
the retrieved context does not support an answer. Phase 3 wraps this in the
LangGraph supervisor; for now it is a clean single-pass baseline.

The retrieval call itself lives in ``app.rag.retriever``; this module owns the
prompt contract and the chunk-to-citation mapping, both of which are pure and
unit-testable without a database or model.
"""

from __future__ import annotations

from app.llm.base import ChatMessage
from app.rag.retriever import RetrievedChunk
from app.rag.web import WebResult
from app.schemas.chat import ChatTurn, Source

SYSTEM_PROMPT = (
    "You are a careful enterprise assistant. Answer ONLY using the numbered context "
    "provided by the user. Follow these rules strictly:\n"
    "- Cite every claim with the source number(s) in square brackets, e.g. [1] or [2][3].\n"
    "- If the context does not contain the answer, reply exactly: \"I don't have enough "
    'information in the provided documents to answer that." Do not use outside knowledge.\n'
    "- Be concise and factual; do not invent sources or numbers."
)

NO_CONTEXT_MSG = "I don't have enough information in the provided documents to answer that."


def format_context(chunks: list[RetrievedChunk]) -> str:
    return "\n\n".join(
        f"[{i}] ({c.citation_anchor})\n{c.content}" for i, c in enumerate(chunks, start=1)
    )


def to_sources(chunks: list[RetrievedChunk]) -> list[Source]:
    return [
        Source(
            n=i,
            doc_id=c.doc_id,
            source_id=c.source_id,
            citation_anchor=c.citation_anchor,
            page=c.page,
            score=round(c.score, 4),
        )
        for i, c in enumerate(chunks, start=1)
    ]


def split_query(messages: list[ChatTurn]) -> tuple[str, list[ChatTurn]]:
    """Final message is the live query; earlier user/assistant turns are memory."""
    query = messages[-1].content
    history = [m for m in messages[:-1] if m.role in ("user", "assistant")]
    return query, history


def build_messages(
    query: str, history: list[ChatTurn], chunks: list[RetrievedChunk]
) -> list[ChatMessage]:
    messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]
    messages += [ChatMessage(role=h.role, content=h.content) for h in history]
    user = f"Context:\n{format_context(chunks)}\n\nQuestion: {query}"
    messages.append(ChatMessage(role="user", content=user))
    return messages


# --- Agentic synthesis (Phase 3): grounds on retrieved chunks + web results ----


def format_agentic_context(chunks: list[RetrievedChunk], web_results: list[WebResult]) -> str:
    blocks: list[str] = []
    n = 1
    for c in chunks:
        blocks.append(f"[{n}] ({c.citation_anchor})\n{c.content}")
        n += 1
    for w in web_results:
        blocks.append(f"[{n}] (web: {w.title} - {w.url})\n{w.content}")
        n += 1
    return "\n\n".join(blocks)


def agentic_sources(chunks: list[RetrievedChunk], web_results: list[WebResult]) -> list[Source]:
    sources: list[Source] = []
    n = 1
    for c in chunks:
        sources.append(
            Source(
                n=n,
                doc_id=c.doc_id,
                source_id=c.source_id,
                citation_anchor=c.citation_anchor,
                page=c.page,
                score=round(c.score, 4),
            )
        )
        n += 1
    for w in web_results:
        sources.append(
            Source(n=n, doc_id=w.url, source_id="web", citation_anchor=w.title, page=0, score=0.0)
        )
        n += 1
    return sources


def build_agentic_messages(
    query: str,
    history: list[ChatTurn],
    chunks: list[RetrievedChunk],
    web_results: list[WebResult],
) -> list[ChatMessage]:
    messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]
    messages += [ChatMessage(role=h.role, content=h.content) for h in history]
    ctx = format_agentic_context(chunks, web_results)
    messages.append(ChatMessage(role="user", content=f"Context:\n{ctx}\n\nQuestion: {query}"))
    return messages
