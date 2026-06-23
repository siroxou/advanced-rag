.DEFAULT_GOAL := help
.PHONY: help install api web up down lint fmt test pull-model check

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv) + frontend (pnpm) deps
	cd backend && uv sync --extra dev
	cd frontend && pnpm install

pull-model: ## Pull the default Gemma 4 model into Ollama
	ollama pull gemma4

up: ## Start local infra (Postgres + pgvector) via Docker
	docker compose up -d

down: ## Stop local infra
	docker compose down

api: ## Run the FastAPI backend → http://localhost:8000
	cd backend && uv run uvicorn app.main:app --reload --port 8000

web: ## Run the Next.js frontend → http://localhost:3000
	cd frontend && pnpm dev

lint: ## Lint + type-check the backend
	cd backend && uv run ruff check . && uv run mypy app

fmt: ## Auto-format the backend
	cd backend && uv run ruff format . && uv run ruff check --fix .

test: ## Run backend tests
	cd backend && uv run pytest -q

check: lint test ## Full quality gate (lint + types + tests)
