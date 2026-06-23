# RAG Backend

FastAPI service for the Enterprise Agentic RAG platform.

```bash
uv sync --extra dev          # install
uv run uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs  (OpenAPI)
# → http://localhost:8000/api/health
```

The LLM layer is an **OpenAI-compatible abstraction** (`app/llm/`): locally it points at
Ollama (`gemma4:latest`); in the cloud it points at vLLM. Swap via `LLM_*` env vars - no
code change. See the root `README.md` and `docs/` for architecture.
