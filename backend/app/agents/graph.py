"""The agent graph: context -> retrieve -> (web?) -> compose.

Compiled once at import. ``run_agent`` runs the planning + retrieval steps and
returns the grounded prompt and sources; the endpoint then streams the synthesis
LLM call, so token streaming stays simple while the routing lives in the graph.
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.nodes import (
    compose_node,
    context_node,
    retrieve_node,
    route_after_retrieve,
    web_node,
)
from app.agents.state import AgentState
from app.llm.base import LLMProvider
from app.schemas.chat import ChatTurn


def _build() -> Any:
    g = StateGraph(AgentState)
    g.add_node("context", context_node)
    g.add_node("retrieve", retrieve_node)
    g.add_node("web", web_node)
    g.add_node("compose", compose_node)
    g.add_edge(START, "context")
    g.add_edge("context", "retrieve")
    g.add_conditional_edges("retrieve", route_after_retrieve, {"web": "web", "compose": "compose"})
    g.add_edge("web", "compose")
    g.add_edge("compose", END)
    return g.compile()


_GRAPH = _build()


async def run_agent(
    session: AsyncSession,
    llm: LLMProvider,
    *,
    username: str,
    roles: list[str],
    query: str,
    history: list[ChatTurn],
) -> AgentState:
    init: AgentState = {
        "username": username,
        "roles": roles,
        "original_query": query,
        "history": history,
    }
    config = {"configurable": {"session": session, "llm": llm}}
    result = await _GRAPH.ainvoke(init, config=config)
    return result
