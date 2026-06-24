# 7. Agentic orchestration with LangGraph

- **Status:** Accepted
- **Date:** 2026-06-24

## Context

Phase 3 makes the system multi-agent and context-aware: a follow-up like "and what is its
codename?" must be understood against the conversation, and some questions warrant a live web
search while others are documents-only. This needs routing, not a fixed pipeline.

## Decision

Use **LangGraph** for a small state graph over four agents:

```
START -> context -> retrieve -> (web?) -> compose -> END
```

- **context** - one LLM call rewrites the latest message into a standalone, history-resolved
  query and decides `need_web`. Output is parsed tolerantly from JSON, falling back to the
  original query.
- **retrieve** - the Phase 1 hybrid retriever, RLS-scoped to the caller's roles.
- **web** - Tavily search, reached only via a conditional edge when `need_web` is true **and**
  the caller's roles permit it **and** a key is configured; otherwise the graph skips straight
  to compose. Without a key it is a no-op, so the graph degrades to documents-only.
- **compose** - assembles the grounded prompt and the numbered sources spanning documents and
  web hits.

**Streaming split.** The graph runs planning + retrieval (non-streaming) and returns the
grounded prompt and sources; the endpoint then streams the synthesis LLM call. This keeps token
streaming trivial while routing lives in the graph. The DB session and LLM are passed via the
graph `config`, not the serializable state.

**Conversation memory is request-scoped, deliberately.** Context-awareness comes from the
context agent resolving the latest turn against the history the client already sends. A
persistent `sessions` table with rolling summaries was scoped out as low-signal for the demo; it
can be added behind the same context agent later without changing the graph.

## Consequences

- Demonstrable context-awareness: the rewritten query is returned to the UI ("searched: ...").
- An extra LLM call per turn (the rewrite); acceptable, and it is short and low-temperature.
- The web agent is wired, gated, and audited (`used_web`) but dormant until `TAVILY_API_KEY` is
  set - the full architecture is present without requiring a paid key for the core demo.
- A critic/grounding agent (a second pass) is deferred to Phase 4 guardrails.
