# Architecture

See the diagram in the [root README](../README.md#architecture). This document covers
the request lifecycle and the subsystem responsibilities.

## Request lifecycle

1. **Auth** - after a sign-in the Next.js console sends a signed JWT, which every write
   requires; the FastAPI gateway validates it and resolves the caller's roles. Without one,
   reads run as a demo identity whose roles come from the role switcher (ADR-0010).
2. **Input guardrails** - prompt-injection check on the user turn, plus an optional safety
   model when `GUARDRAILS_SAFETY_MODEL` is set.
3. **Supervisor (LangGraph)** - plans the query and routes to agents.
4. **Context/Query agent** - rewrites the latest message into a standalone query using the
   conversation, and decides whether web search is needed. *This is where "context-aware"
   lives.*
5. **Retrieval agent** - hybrid (dense + sparse) search in pgvector, **filtered by RLS**,
   then cross-encoder rerank → top-k context.
6. **Web search agent** - Tavily for live/recent info (permission-gated).
7. **Synthesis agent** - the configured model (Gemma 4 by default) produces a grounded answer
   with inline `[n]` citations.
8. **Output guardrails** - citation validation (a `[n]` pointing at a source that was not
   retrieved is flagged to the UI) and PII detection or masking. When retrieval returns
   nothing the answer is a fixed refusal.
9. **Audit (+ optional trace)** - every answered query is written to the audit log with its
   latency, token cost and grounding verdict; LangFuse tracing is optional (see the runbook).

## Subsystems

| Subsystem | Path | Responsibility |
|---|---|---|
| Inference abstraction | `backend/app/llm/` | OpenAI-compatible provider over Ollama / vLLM |
| Ingestion | `backend/app/ingestion/` | PDF → chunk → embed → pgvector (+ ACL columns) |
| Retrieval | `backend/app/rag/` | Hybrid search + rerank, RLS-filtered |
| RBAC / security | `backend/alembic/versions/0002_auth_rls_audit.py`, `app/security/`, `app/api/deps.py` | Roles, RLS policies, audit log |
| Agents | `backend/app/agents/` | LangGraph supervisor + agent nodes |
| Guardrails | `backend/app/guardrails/` | Layered input and output checks |
| Observability | `backend/app/observability/`, `app/api/routes/metrics.py` | Cost pricing, optional LangFuse trace, metrics aggregate |

## Key design principle

The **inference abstraction** is the keystone that lets one codebase serve both the local
(Ollama on Apple Metal) and cloud (vLLM on Modal) profiles. Nothing above `app/llm/`
knows or cares where Gemma 4 physically runs.
