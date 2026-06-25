.DEFAULT_GOAL := help
.PHONY: help install api web up down lint fmt test pull-model check migrate corpus ingest classify ingest-auto hf-ingest presets preset seed dataset eval-lora

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv, incl. ml extra) + frontend (pnpm) deps
	cd backend && uv sync --extra ml --extra dev
	cd frontend && pnpm install

pull-model: ## Pull the default Gemma 4 model into Ollama
	ollama pull gemma4

up: ## Start local infra (Postgres + pgvector) via Docker
	docker compose up -d

down: ## Stop local infra
	docker compose down

migrate: ## Apply database migrations (Alembic)
	cd backend && uv run alembic upgrade head

seed: ## Create demo users (viewer/analyst/admin, password: demo)
	cd backend && uv run python -m app.security.seed

dataset: ## Generate a grounded LoRA dataset from the corpus (-> ml/datasets)
	cd backend && uv run python -m app.finetune.dataset --limit $(or $(LIMIT),200)

eval-lora: ## Evaluate grounded answering on the held-out set (override LLM_MODEL to compare)
	cd backend && uv run python -m app.finetune.evaluate --data ../ml/datasets/valid.jsonl

corpus: ## Download a small sample PDF corpus into backend/data/raw
	cd backend && uv run python ../scripts/fetch_sample_corpus.py

ingest: ## Ingest backend/data/raw into the corpus (override ROLES=... SOURCE=...)
	cd backend && uv run python -m app.ingestion.cli \
		--input data/raw --source-id $(or $(SOURCE),corpus) --roles $(or $(ROLES),viewer,analyst,admin)

classify: ## Preview AI-proposed RBAC tiers for backend/data/raw (no DB writes)
	cd backend && uv run python -m app.ingestion.cli \
		--input data/raw --source-id $(or $(SOURCE),corpus) --classify --dry-run

ingest-auto: ## Ingest backend/data/raw with AI-assigned RBAC tiers (fails closed)
	cd backend && uv run python -m app.ingestion.cli \
		--input data/raw --source-id $(or $(SOURCE),corpus) --classify

hf-ingest: ## Ingest a HuggingFace text dataset (override DATASET=... LIMIT=... ROLES=...)
	cd backend && uv run python -m app.ingestion.hf_cli \
		--dataset $(or $(DATASET),Postzeun/Patient-Doctor) --limit $(or $(LIMIT),100) \
		--roles $(or $(ROLES),analyst,admin) --sensitivity $(or $(SENSITIVITY),internal) \
		--record-prefix $(or $(PREFIX),"This is a conversation between a patient and a doctor")

presets: ## List ready-made corpus presets (no PDFs of your own needed)
	cd backend && uv run python -m app.ingestion.presets_cli --list

preset: ## Ingest a corpus preset (NAME=fred-core | patient-doctor, override LIMIT=... ROLES=...)
	cd backend && uv run python -m app.ingestion.presets_cli --name $(or $(NAME),fred-core) \
		$(if $(LIMIT),--limit $(LIMIT),) $(if $(ROLES),--roles $(ROLES),)

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
