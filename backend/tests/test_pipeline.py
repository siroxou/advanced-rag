"""Unit tests for the grounded-prompt builder (pure, no DB or model)."""

from __future__ import annotations

from app.llm.base import ChatMessage
from app.rag import pipeline
from app.rag.retriever import RetrievedChunk
from app.schemas.chat import ChatTurn


def _chunk(i: int) -> RetrievedChunk:
    return RetrievedChunk(
        id=str(i),
        doc_id="doc",
        source_id="demo",
        content=f"content {i}",
        page=i,
        citation_anchor=f"doc p.{i}",
        score=0.5,
    )


def test_format_context_numbers_sequentially():
    ctx = pipeline.format_context([_chunk(1), _chunk(2)])
    assert "[1]" in ctx
    assert "[2]" in ctx
    assert "content 1" in ctx


def test_to_sources_renumbers_from_one():
    sources = pipeline.to_sources([_chunk(7), _chunk(8)])
    assert [s.n for s in sources] == [1, 2]
    assert sources[0].citation_anchor == "doc p.7"


def test_split_query_takes_final_message_as_query():
    msgs = [
        ChatTurn(role="user", content="first"),
        ChatTurn(role="assistant", content="reply"),
        ChatTurn(role="user", content="latest"),
    ]
    query, history = pipeline.split_query(msgs)
    assert query == "latest"
    assert [h.content for h in history] == ["first", "reply"]


def test_build_messages_grounds_with_system_and_context():
    msgs = pipeline.build_messages("q?", [], [_chunk(1)])
    assert isinstance(msgs[0], ChatMessage)
    assert msgs[0].role == "system"
    assert msgs[-1].role == "user"
    assert "Context:" in msgs[-1].content
    assert "Question: q?" in msgs[-1].content


def test_build_messages_includes_history():
    history = [ChatTurn(role="user", content="earlier"), ChatTurn(role="assistant", content="ok")]
    msgs = pipeline.build_messages("now?", history, [_chunk(1)])
    contents = [m.content for m in msgs]
    assert "earlier" in contents
    assert "ok" in contents
