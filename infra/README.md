# infra/ - Deployment

**Local** infra is `docker-compose.yml` at the repo root (Postgres + pgvector). Gemma 4 runs
on the host via Ollama (macOS has no Docker GPU passthrough).

**Cloud / IaC (Phase 6)** - committed as *artifacts* validated in CI (`helm lint`,
`helm template`, `terraform validate`), not a continuously-running cluster (see
[ADR-0004](../docs/adr/0004-iac-as-artifact.md)):

```
helm/          Kubernetes chart: backend, frontend, optional vLLM GPU pool, ingress
terraform/     GKE cluster + scale-to-zero GPU node pool + Cloud SQL Postgres
modal/app.py   serverless deploy: FastAPI + scale-to-zero vLLM GPU
```

```bash
helm lint infra/helm && helm template advanced-rag infra/helm   # validate the chart
terraform -chdir=infra/terraform init -backend=false && terraform -chdir=infra/terraform validate
```

The **live demo** runs cheaply, no cluster required:

- **Vercel** (frontend) - `infra` is not needed; `frontend/vercel.json` + the dashboard env.
- **Modal** (FastAPI + serverless GPU vLLM, scale-to-zero) - `modal deploy infra/modal/app.py`.
- **Neon/Supabase** (managed pgvector) - point `DATABASE_URL` at it; the app role must be a
  non-superuser so RLS binds.

The RAG quality gate (citation accuracy) runs in
[`.github/workflows/eval.yml`](../.github/workflows/eval.yml) on demand and nightly.
