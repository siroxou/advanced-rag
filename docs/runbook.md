# Runbook

Operational notes for running and troubleshooting the platform.

## Local bring-up

```bash
make pull-model      # Gemma 4 into Ollama
make install         # deps
make up              # Postgres + pgvector (Docker)
make api             # backend
make web             # frontend
make check           # lint + types + tests
```

## Common issues

**`/api/health` shows `llm_reachable: false`**
- Is Ollama running? `ollama list` should show `gemma4`. Start it with `ollama serve` (or the app).
- Check `LLM_BASE_URL` (default `http://localhost:11434/v1`).

**Gemma 4 returns an empty answer**
- Expected if `max_tokens` is tiny - Gemma 4 reasoning can consume the whole budget. The
  provider floors the answer budget (`_MIN_ANSWER_TOKENS`); keep `LLM_ENABLE_THINKING=false`
  for the answer path.

**`make up` fails / DB unreachable**
- Docker Desktop must be running (macOS has no GPU passthrough, so only Postgres is
  containerized - Gemma runs on the host via Ollama).

## Observability (Phase 6)
- Every chat request is recorded in `audit_log` with latency, token cost and grounding; the
  Metrics page (admin only) aggregates it into P50/P95 latency, cost and citation coverage.
- LangFuse tracing is optional and off by default: install it with
  `cd backend && uv sync --extra obs`, set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` in
  `backend/.env`, and each chat request becomes one trace. It targets the Langfuse v2 client.
