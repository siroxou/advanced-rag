# Contributing

Thanks for your interest! This repo follows a few conventions to keep it clean and reviewable.

## Workflow

1. Branch from `main`: `git checkout -b feat/<short-name>`.
2. Make changes; keep PRs focused and small.
3. Run the quality gate locally: `make check` (ruff + mypy + pytest).
4. Open a PR. CI must be green before merge.

## Commit messages - [Conventional Commits](https://www.conventionalcommits.org/)

```
<type>(<scope>): <subject>

feat(retrieval): add hybrid dense+sparse search
fix(llm): floor answer token budget for Gemma 4 reasoning
docs(adr): record pgvector + RLS decision
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`. The CHANGELOG is derived from these.

## Code style

- **Backend (Python):** `ruff` (lint + format) and `mypy` are enforced in CI. Target 3.12, type-hint public functions.
- **Frontend (TS):** ESLint + the Next.js defaults; build must pass.

## Tests

Add or update tests for behavior changes. Backend tests live in `backend/tests/` and must not require network or a database to pass (mock or skip external deps).
