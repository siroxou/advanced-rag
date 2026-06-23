# infra/ - Deployment

**Local** infra is `docker-compose.yml` at the repo root (Postgres + pgvector). Gemma 4 runs
on the host via Ollama (macOS has no Docker GPU passthrough).

**Cloud / IaC (Phase 6)** - committed as *artifacts* validated in CI (`helm template`,
`terraform validate`), not a continuously-running cluster (see
[ADR-0004](../docs/adr/0004-iac-as-artifact.md)):

```
helm/         Kubernetes chart (vLLM on a GPU node pool, backend, frontend)
terraform/    cloud infra: cluster + GPU node pool + managed Postgres
```

The live demo itself runs cheaply on **Vercel** (frontend) + **Modal** (FastAPI + serverless
GPU, scale-to-zero) + **Neon/Supabase** (managed pgvector).
