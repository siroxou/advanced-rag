"""Grounded chat endpoints (Phase 1-4).

Auth is required. Each request passes input guardrails (injection/safety) before any
work; with RAG on it then runs the LangGraph agent (context-rewrite -> retrieval ->
optional web -> compose) and generates an answer; output guardrails validate citations
and scan for PII. Roles come only from the verified JWT and are enforced in-database by
RLS. Every answer is recorded in the append-only audit log.

Streaming SSE: a ``{"sources": [...], "rewritten_query": ..., "used_web": ...}`` frame,
then ``{"delta": "..."}`` frames, a ``{"guardrails": {...}}`` frame, then ``[DONE]``.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import run_agent
from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_session
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


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


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
        content = await llm.chat(msgs, temperature=req.temperature, max_tokens=req.max_tokens)
        await write_audit(
            username=user.username,
            roles=user.roles,
            query=query,
            retrieved_doc_ids=[],
            answer=content,
            latency_ms=_elapsed_ms(started),
        )
        return ChatResponse(
            content=content, model=llm.model, guardrails=_report(run_output_guardrails(content, 0))
        )

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

    content = await llm.chat(
        state["messages"], temperature=req.temperature, max_tokens=req.max_tokens
    )
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
        guardrails=_report(run_output_guardrails(content, len(sources))),
    )


@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    llm = get_llm()

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
            state = await run_agent(
                session,
                llm,
                username=user.username,
                roles=user.roles,
                query=query,
                history=history,
            )
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
        async for chunk in llm.stream(msgs, temperature=req.temperature, max_tokens=req.max_tokens):
            if chunk.delta:
                parts.append(chunk.delta)
                yield f"data: {json.dumps({'delta': chunk.delta})}\n\n"

        answer = "".join(parts)
        out = run_output_guardrails(answer, n_sources)
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
