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
- LangFuse traces every agent step. Local self-host or free cloud tier; set `LANGFUSE_*` in `.env`.

## Self-hosting LangFuse (optional)
LangFuse v3 needs Postgres + ClickHouse + Redis; for the lean local profile we default to the
free cloud tier. A `docker-compose.langfuse.yml` can be added when full self-hosting is needed.
