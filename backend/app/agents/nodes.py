"""Agent node implementations.

Each node takes the shared ``AgentState`` plus the graph ``config`` (which carries
the request's DB session and LLM) and returns the keys it updates.
"""

from __future__ import annotations

import json
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.agents.state import AgentState
from app.core.logging import get_logger
from app.llm.base import ChatMessage
from app.rag import pipeline
from app.rag.retriever import retrieve
from app.rag.web import web_allowed, web_search

logger = get_logger(__name__)

_REWRITE_SYS = (
    "You prepare a user's latest message for document retrieval. Using the prior "
    "conversation, rewrite it into a single standalone search query; if it is already "
    "standalone, return it unchanged. Also decide whether answering needs fresh or external "
    "information beyond a static internal document corpus (recent events, live data, current "
    "prices, news). Respond with ONLY a JSON object: "
    '{"query": "<standalone query>", "need_web": <true|false>}.'
)


def _parse_rewrite(raw: str, fallback: str) -> tuple[str, bool]:
    """Tolerant extraction of the rewrite JSON; falls back to the original query."""
    try:
        start = raw.index("{")
        end = raw.rindex("}")
        obj = json.loads(raw[start : end + 1])
    except (ValueError, json.JSONDecodeError):
        return fallback, False
    query = str(obj.get("query") or "").strip() or fallback
    return query, bool(obj.get("need_web", False))


async def context_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    """Resolve the latest message into a standalone query and route web vs not."""
    llm = config["configurable"]["llm"]
    original = state["original_query"]
    history = state.get("history", [])
    convo = "\n".join(f"{h.role}: {h.content}" for h in history) or "(none)"
    prompt = f"Conversation:\n{convo}\n\nLatest message: {original}"
    raw = await llm.chat(
        [
            ChatMessage(role="system", content=_REWRITE_SYS),
            ChatMessage(role="user", content=prompt),
        ],
        temperature=0.0,
        max_tokens=256,
    )
    query, need_web = _parse_rewrite(raw, original)
    logger.info("context_agent", original=original, rewritten=query, need_web=need_web)
    return {"query": query, "need_web": need_web}


async def retrieve_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    session = config["configurable"]["session"]
    chunks = await retrieve(session, state["query"], state["roles"])
    return {"chunks": chunks}


async def web_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    results = await web_search(state["query"])
    return {"web_results": results, "used_web": bool(results)}


def compose_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    chunks = state.get("chunks", [])
    web_results = state.get("web_results", [])
    history = state.get("history", [])
    query = state["query"]
    return {
        "messages": pipeline.build_agentic_messages(query, history, chunks, web_results),
        "sources": pipeline.agentic_sources(chunks, web_results),
        "doc_ids": sorted({c.doc_id for c in chunks}),
    }


def route_after_retrieve(state: AgentState) -> str:
    """Supervisor decision: branch to the web agent only when warranted and permitted."""
    if state.get("need_web") and web_allowed(state.get("roles", [])):
        return "web"
    return "compose"
