# Threat Model

A lightweight STRIDE-flavored model for the risks that matter most in an enterprise RAG.

## Assets
- Source documents and their access-control labels.
- User identities, roles, and the audit trail.
- The LLM endpoint and its compute.

## Top threats & mitigations

| # | Threat | Vector | Mitigation |
|---|---|---|---|
| T1 | **RAG data-exfiltration** | A user retrieves chunks they aren't cleared for | **Postgres RLS** filters every retrieval at the DB layer (ADR-0003); ACLs set at ingestion |
| T2 | **Prompt injection** | Malicious instructions in the query or in a retrieved/web document | Regex injection check blocks the user query (plus an optional safety model when configured); the system prompt limits answers to the numbered context but does not tell the model to ignore instructions inside it; ingested documents are admin-curated; web-search results are not screened yet |
| T3 | **Unsafe / hallucinated output** | Model emits harmful or unsupported claims | Citation check flags citations to sources that were not retrieved; nothing retrieved means a fixed refusal; no output safety model runs |
| T4 | **PII leakage** | Sensitive data in answers or logs | Regex PII detection and optional masking (Presidio is a drop-in, not installed); audit log stores answer hashes, not raw answers (queries are stored) |
| T5 | **AuthZ bypass** | Forged/elevated roles, client-supplied filters | Server-side JWT validation, with startup refusing the public default secret outside `ENVIRONMENT=local`. With `AUTH_REQUIRED=true`, RLS roles come only from the verified JWT. In the default demo mode, reads use client-chosen roles via `X-Demo-Roles` (that is the role switcher); every write, other users' audit rows and the metrics aggregate need a signed admin token (ADR-0010) |
| T6 | **Abuse / DoS** | Excessive or automated requests | A per-IP rate limit on chat applies only while requests spend the shared demo OpenRouter key; local providers and bring-your-own keys are not throttled, so DoS protection in a deployment is left to the platform or a reverse proxy; every request is audited |

## Non-goals (this phase)
- Full multi-tenant isolation (single-tenant assumed; there is no `tenant_id` in the schema yet).
- Secrets management beyond `.env` locally / platform secrets in cloud.
