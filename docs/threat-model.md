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
| T2 | **Prompt injection** | Malicious instructions in the query or in a retrieved/web document | Input injection check + ShieldGemma; retrieved content is treated as data, not instructions; output grounding check |
| T3 | **Unsafe / hallucinated output** | Model emits harmful or unsupported claims | ShieldGemma output safety + grounding/citation validator → refuse, don't ship |
| T4 | **PII leakage** | Sensitive data in answers or logs | Presidio PII detection/redaction (pluggable); audit log stores hashes, not raw answers |
| T5 | **AuthZ bypass** | Forged/elevated roles, client-supplied filters | Server-side JWT validation; RLS derives filters from the verified identity, never client input |
| T6 | **Abuse / DoS** | Excessive or automated requests | Rate limiting + audit; cloud profile sits behind platform protections |

## Non-goals (this phase)
- Full multi-tenant isolation (single-tenant assumed; `tenant_id` reserved in schema).
- Secrets management beyond `.env` locally / platform secrets in cloud.
