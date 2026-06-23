# 4. Infrastructure-as-Code as an artifact (not a running cluster)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context

"Enterprise deployment" suggests Kubernetes. But a portfolio gains ~zero extra signal from
keeping a **GPU** cluster running 24/7 for occasional recruiter traffic - while paying real
money and maintenance for it.

## Decision

Commit a **working Helm chart and Terraform** (`infra/helm`, `infra/terraform`) that *would*
deploy the system to K8s with a GPU node pool, validated in CI with `helm template` and
`terraform validate`/`plan`. Run the **actual** live demo cheaply on **Vercel + Modal**
(serverless GPU, scale-to-zero ≈ $0 idle) with a managed Postgres.

## Consequences

- Demonstrates K8s/Terraform capability (résumé-relevant) without a money furnace.
- The IaC is real and reviewable, just not continuously applied.
- Showing this judgment is itself a senior signal.
