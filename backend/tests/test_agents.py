"""Unit tests for agent helpers (pure, no DB or model)."""

from __future__ import annotations

import pytest

from app.agents.nodes import _parse_rewrite, route_after_retrieve
from app.core.config import settings
from app.rag import pipeline
from app.rag.retriever import RetrievedChunk
from app.rag.web import WebResult, web_allowed


def _chunk() -> RetrievedChunk:
    return RetrievedChunk(
        id="1",
        doc_id="d",
        source_id="demo",
        content="x",
        page=1,
        citation_anchor="doc p.1",
        score=0.9,
    )


def test_parse_rewrite_extracts_json_with_surrounding_text():
    query, need_web = _parse_rewrite('Sure: {"query": "standalone q", "need_web": true}', "fb")
    assert query == "standalone q"
    assert need_web is True


def test_parse_rewrite_falls_back_on_garbage():
    assert _parse_rewrite("no json here", "fb") == ("fb", False)


def test_parse_rewrite_empty_query_uses_fallback():
    query, _ = _parse_rewrite('{"query": "", "need_web": false}', "fb")
    assert query == "fb"


def test_web_allowed_requires_role_and_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "tavily_api_key", "")
    assert web_allowed(["admin"]) is False  # no key
    monkeypatch.setattr(settings, "tavily_api_key", "key")
    assert web_allowed(["admin"]) is True
    assert web_allowed(["analyst"]) is True
    assert web_allowed(["viewer"]) is False  # role not permitted


def test_route_after_retrieve(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "tavily_api_key", "key")
    assert route_after_retrieve({"need_web": True, "roles": ["admin"]}) == "web"
    assert route_after_retrieve({"need_web": False, "roles": ["admin"]}) == "compose"
    assert route_after_retrieve({"need_web": True, "roles": ["viewer"]}) == "compose"


def test_agentic_sources_number_across_docs_then_web():
    sources = pipeline.agentic_sources(
        [_chunk()], [WebResult(title="T", url="http://e", content="c")]
    )
    assert [s.n for s in sources] == [1, 2]
    assert sources[0].source_id == "demo"
    assert sources[1].source_id == "web"
    assert sources[1].citation_anchor == "T"
