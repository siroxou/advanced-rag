"""Request/response models for the chat endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1)


class Source(BaseModel):
    """A retrieved chunk surfaced as a citation. ``n`` matches the inline [n] marker."""

    n: int
    doc_id: str
    source_id: str
    citation_anchor: str
    page: int
    score: float


class ChatRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    # Ground answers in retrieved documents. False falls back to a raw LLM call.
    # NOTE: roles are NOT accepted here - they come only from the verified JWT.
    use_rag: bool = True


class GuardrailReport(BaseModel):
    """Guardrail verdicts (Phase 4) attached to each answer."""

    input_blocked: bool = False
    block_reason: str | None = None
    grounding_ok: bool = True
    invalid_citations: list[int] = Field(default_factory=list)
    pii_found: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    content: str
    model: str
    sources: list[Source] = Field(default_factory=list)
    # Agent trace (Phase 3): the history-resolved query and whether web search ran.
    rewritten_query: str | None = None
    used_web: bool = False
    guardrails: GuardrailReport = Field(default_factory=GuardrailReport)
