"""Baseline chat endpoints (Phase 0).

Phase 1 wraps these with retrieval; Phase 3 routes them through the LangGraph
multi-agent supervisor. The streaming endpoint emits SSE JSON deltas.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.llm.base import ChatMessage
from app.llm.factory import get_llm
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    llm = get_llm()
    msgs = [ChatMessage(role=m.role, content=m.content) for m in req.messages]
    content = await llm.chat(msgs, temperature=req.temperature, max_tokens=req.max_tokens)
    return ChatResponse(content=content, model=llm.model)


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    llm = get_llm()
    msgs = [ChatMessage(role=m.role, content=m.content) for m in req.messages]

    async def event_gen() -> AsyncIterator[str]:
        async for chunk in llm.stream(msgs, temperature=req.temperature, max_tokens=req.max_tokens):
            if chunk.delta:
                yield f"data: {json.dumps({'delta': chunk.delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
