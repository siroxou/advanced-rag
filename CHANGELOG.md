# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project uses
[Conventional Commits](https://www.conventionalcommits.org/) and semantic versioning.

## [Unreleased]

### Added - Phase 0 (scaffold)
- Monorepo layout (`backend/`, `frontend/`, `ml/`, `infra/`, `docs/`).
- FastAPI backend skeleton with health + baseline chat (sync + SSE streaming) endpoints.
- **Inference abstraction** (`app/llm/`): one OpenAI-compatible interface over Ollama
  (local Gemma 4) and vLLM (cloud), selected by env vars.
- Gemma 4 reasoning handling: thinking toggle + answer token-budget floor so the
  final answer always lands (verified live against `gemma4:latest`).
- `docker-compose.yml` (Postgres + pgvector), `Makefile`, `.env.example`.
- CI (ruff · ruff-format · mypy · pytest · frontend build), pre-commit hooks.
- Documentation: README + architecture, ADRs, threat model, runbook. Apache-2.0 license.
