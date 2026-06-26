"""Grounded chat endpoints (Phase 1-4).

Each request passes input guardrails (injection/safety) before any work; with RAG on
it then runs the LangGraph agent (context-rewrite -> retrieval -> optional web ->
compose) and generates an answer; output guardrails validate citations and scan for
PII. Roles come from the verified JWT (or the demo identity in demo mode) and are
enforced in-database by RLS. Every answer is recorded in the append-only audit log.

Streaming SSE frames, in order: a ``{"plan": [...]}`` frame listing the agent steps,
then ``{"step": {...}}`` frames as each node completes, a
``{"sources": [...], "rewritten_query": ..., "used_web": ...}`` frame, then
``{"delta": "..."}`` token frames, a ``{"guardrails": {...}}`` frame, then ``[DONE]``.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import run_agent, stream_agent
from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_session
from app.core.runtime_settings import runtime
from app.guardrails.engine import (
    INPUT_BLOCKED_MSG,
    OutputReport,
    run_input_guardrails,
    run_output_guardrails,
)
from app.llm.base import ChatMessage
from app.llm.factory import get_llm
from app.rag import pipeline
from app.rag.audit import write_audit
from app.schemas.chat import ChatRequest, ChatResponse, GuardrailReport

# Human labels for each agent step, surfaced to the UI progress timeline. The
# graph emits the first four as it runs; "answer" is the synthesis stream itself.
_STEP_LABELS = {
    "context": "Understanding the question",
    "retrieve": "Searching the knowledge base",
    "web": "Searching the web",
    "compose": "Assembling grounded context",
    "answer": "Generating the answer",
}

# Steps shown up front; the conditional "web" step is inserted by the UI if and
# when the agent actually reaches for it.
_PLAN = ["context", "retrieve", "compose", "answer"]


def _step_detail(node: str, state: dict[str, Any]) -> dict[str, Any]:
    """One-line, JSON-safe summary of what a node produced, for the UI timeline."""
    if node == "context":
        return {"rewritten_query": state.get("query"), "need_web": bool(state.get("need_web"))}
    if node == "retrieve":
        return {"chunks": len(state.get("chunks", []))}
    if node == "web":
        return {"results": len(state.get("web_results", []))}
    if node == "compose":
        return {"sources": len(state.get("sources", []))}
    return {}


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def _gen_params(req: ChatRequest) -> tuple[float, int]:
    """Resolve generation params: an explicit request value wins, else the runtime default."""
    temperature = req.temperature if req.temperature is not None else runtime.get_temperature()
    max_tokens = req.max_tokens if req.max_tokens is not None else runtime.get_max_tokens()
    return temperature, max_tokens


def _report(out: OutputReport) -> GuardrailReport:
    return GuardrailReport(
        grounding_ok=out.grounding_ok,
        invalid_citations=out.invalid_citations,
        pii_found=out.pii_found,
    )


router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChatResponse:
    llm = get_llm()
    temperature, max_tokens = _gen_params(req)
    query, history = pipeline.split_query(req.messages)
    started = time.perf_counter()

    gin = await run_input_guardrails(query)
    if gin.blocked:
        message = f"{INPUT_BLOCKED_MSG} ({gin.reason})"
        await write_audit(
            username=user.username,
            roles=user.roles,
            query=query,
            retrieved_doc_ids=[],
            answer=message,
            latency_ms=_elapsed_ms(started),
        )
        return ChatResponse(
            content=message,
            model=llm.model,
            guardrails=GuardrailReport(input_blocked=True, block_reason=gin.reason),
        )

    if not req.use_rag:
        msgs = [ChatMessage(role=m.role, content=m.content) for m in req.messages]
        content = await llm.chat(msgs, temperature=temperature, max_tokens=max_tokens)
        out = run_output_guardrails(content, 0)
        content = out.masked_answer or content
        await write_audit(
            username=user.username,
            roles=user.roles,
            query=query,
            retrieved_doc_ids=[],
            answer=content,
            latency_ms=_elapsed_ms(started),
        )
        return ChatResponse(content=content, model=llm.model, guardrails=_report(out))

    state = await run_agent(
        session, llm, username=user.username, roles=user.roles, query=query, history=history
    )
    sources = state.get("sources", [])
    if not sources:
        await write_audit(
            username=user.username,
            roles=user.roles,
            query=state.get("query", query),
            retrieved_doc_ids=[],
            answer=pipeline.NO_CONTEXT_MSG,
            latency_ms=_elapsed_ms(started),
        )
        return ChatResponse(
            content=pipeline.NO_CONTEXT_MSG, model=llm.model, rewritten_query=state.get("query")
        )

    content = await llm.chat(state["messages"], temperature=temperature, max_tokens=max_tokens)
    out = run_output_guardrails(content, len(sources))
    content = out.masked_answer or content
    await write_audit(
        username=user.username,
        roles=user.roles,
        query=state.get("query", query),
        retrieved_doc_ids=state.get("doc_ids", []),
        answer=content,
        latency_ms=_elapsed_ms(started),
        used_web=state.get("used_web", False),
    )
    return ChatResponse(
        content=content,
        model=llm.model,
        sources=sources,
        rewritten_query=state.get("query"),
        used_web=state.get("used_web", False),
        guardrails=_report(out),
    )


@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    llm = get_llm()
    temperature, max_tokens = _gen_params(req)

    async def event_gen() -> AsyncIterator[str]:
        query, history = pipeline.split_query(req.messages)
        started = time.perf_counter()

        gin = await run_input_guardrails(query)
        if gin.blocked:
            guard: dict[str, Any] = {"input_blocked": True, "block_reason": gin.reason}
            yield f"data: {json.dumps({'guardrails': guard})}\n\n"
            message = f"{INPUT_BLOCKED_MSG} ({gin.reason})"
            yield f"data: {json.dumps({'delta': message})}\n\n"
            yield "data: [DONE]\n\n"
            await write_audit(
                username=user.username,
                roles=user.roles,
                query=query,
                retrieved_doc_ids=[],
                answer=message,
                latency_ms=_elapsed_ms(started),
            )
            return

        if not req.use_rag:
            msgs = [ChatMessage(role=m.role, content=m.content) for m in req.messages]
            doc_ids: list[str] = []
            n_sources = 0
            used_web = False
        else:
            # Announce the plan so the UI can render the step checklist immediately,
            # then stream the graph and tick each node done as it completes.
            plan = [{"node": n, "label": _STEP_LABELS[n]} for n in _PLAN]
            yield f"data: {json.dumps({'plan': plan})}\n\n"

            state: dict[str, Any] = {}
            async for node, merged in stream_agent(
                session,
                llm,
                username=user.username,
                roles=user.roles,
                query=query,
                history=history,
            ):
                state = merged
                step = {
                    "node": node,
                    "label": _STEP_LABELS.get(node, node),
                    "status": "done",
                    "detail": _step_detail(node, merged),
                }
                yield f"data: {json.dumps({'step': step})}\n\n"

            sources = state.get("sources", [])
            meta = {
                "sources": [s.model_dump() for s in sources],
                "rewritten_query": state.get("query"),
                "used_web": state.get("used_web", False),
            }
            yield f"data: {json.dumps(meta)}\n\n"
            if not sources:
                yield f"data: {json.dumps({'delta': pipeline.NO_CONTEXT_MSG})}\n\n"
                yield "data: [DONE]\n\n"
                await write_audit(
                    username=user.username,
                    roles=user.roles,
                    query=state.get("query", query),
                    retrieved_doc_ids=[],
                    answer=pipeline.NO_CONTEXT_MSG,
                    latency_ms=_elapsed_ms(started),
                )
                return
            msgs = state["messages"]
            doc_ids = state.get("doc_ids", [])
            n_sources = len(sources)
            used_web = state.get("used_web", False)
            query = state.get("query", query)

        parts: list[str] = []
        async for chunk in llm.stream(msgs, temperature=temperature, max_tokens=max_tokens):
            if chunk.delta:
                parts.append(chunk.delta)
                yield f"data: {json.dumps({'delta': chunk.delta})}\n\n"

        answer = "".join(parts)
        out = run_output_guardrails(answer, n_sources)
        # Tokens are already on the wire, so masking can't retract them; instead
        # emit the sanitized answer as a replacement frame the UI swaps in.
        if out.masked_answer is not None:
            answer = out.masked_answer
            yield f"data: {json.dumps({'content_masked': answer})}\n\n"
        guard = {
            "grounding_ok": out.grounding_ok,
            "invalid_citations": out.invalid_citations,
            "pii_found": out.pii_found,
        }
        yield f"data: {json.dumps({'guardrails': guard})}\n\n"
        yield "data: [DONE]\n\n"

        await write_audit(
            username=user.username,
            roles=user.roles,
            query=query,
            retrieved_doc_ids=doc_ids,
            answer=answer,
            latency_ms=_elapsed_ms(started),
            used_web=used_web,
        )

    return StreamingResponse(event_gen(), media_type="text/event-stream")
