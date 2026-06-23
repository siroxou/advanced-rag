# Architecture

See the diagram in the [root README](../README.md#architecture). This document covers
the request lifecycle and the subsystem responsibilities.

## Request lifecycle

1. **Auth** - the Next.js frontend obtains a JWT; the FastAPI gateway validates it and
   resolves the caller's roles / groups / clearance.
2. **Input guardrails** - prompt-injection and ShieldGemma safety checks on the user turn.
3. **Supervisor (LangGraph)** - plans the query and routes to agents.
4. **Context/Query agent** - rewrites the query using conversation memory; decomposes
   multi-part questions; decides datasource(s). *This is where "context-aware" lives.*
5. **Retrieval agent** - hybrid (dense + sparse) search in pgvector, **filtered by RLS**,
   then cross-encoder rerank → top-k context.
6. **Web search agent** - Tavily for live/recent info (permission-gated).
7. **Synthesis agent** - Gemma 4 produces a grounded answer with inline `[doc_id]` citations.
8. **Output guardrails** - ShieldGemma output safety + grounding/citation validation; an
   unsupported answer is refused, not shipped.
9. **Trace + audit** - every step is traced (LangFuse) and written to an append-only audit log.

## Subsystems

| Subsystem | Path | Responsibility |
|---|---|---|
| Inference abstraction | `backend/app/llm/` | OpenAI-compatible provider over Ollama / vLLM |
| Ingestion | `backend/app/ingestion/` | PDF → chunk → embed → pgvector (+ ACL columns) |
| Retrieval | `backend/app/retrieval/` | Hybrid search + rerank, RLS-filtered |
| RBAC / security | `backend/app/rbac/`, `app/security/` | Roles, RLS policies, audit log |
| Agents | `backend/app/agents/` | LangGraph supervisor + agent nodes |
| Memory | `backend/app/memory/` | Short/long-term conversation context |
| Guardrails | `backend/app/guardrails/` | Layered input/retrieval/output safety |

## Key design principle

The **inference abstraction** is the keystone that lets one codebase serve both the local
(Ollama on Apple Metal) and cloud (vLLM on Modal) profiles. Nothing above `app/llm/`
knows or cares where Gemma 4 physically runs.
