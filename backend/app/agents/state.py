"""Shared state passed between agent nodes in the graph."""

from __future__ import annotations

from typing import TypedDict

from app.llm.base import ChatMessage
from app.rag.retriever import RetrievedChunk
from app.rag.web import WebResult
from app.schemas.chat import ChatTurn, Source


class AgentState(TypedDict, total=False):
    # --- inputs ---
    username: str
    roles: list[str]
    original_query: str
    history: list[ChatTurn]
    # --- context agent ---
    query: str  # standalone, history-resolved query
    need_web: bool
    # --- retrieval + web agents ---
    chunks: list[RetrievedChunk]
    web_results: list[WebResult]
    used_web: bool
    # --- compose ---
    messages: list[ChatMessage]  # grounded prompt for the synthesis call
    sources: list[Source]
    doc_ids: list[str]
