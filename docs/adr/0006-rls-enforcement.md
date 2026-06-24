# 6. Enforcing RLS: FORCE, a least-privilege role, and a request-scoped GUC

- **Status:** Accepted
- **Date:** 2026-06-24

## Context

[ADR-0003](0003-pgvector-rls-for-rbac.md) chose Postgres Row-Level Security as the RBAC
enforcement point. Phase 2 implements it. Getting RLS to actually hold requires three details
that are easy to get wrong, each of which would silently disable the protection.

## Decision

1. **Roles come from a signed JWT, never the request body.** Login returns a token whose
   `roles` claim is the only authorization the API trusts. The chat request no longer accepts a
   `roles` field at all.

2. **The roles are pushed into a request-scoped GUC, and the policy reads it.** Per retrieval
   transaction the app runs `set_config('app.user_roles', '<csv>', true)` (transaction-local).
   The policy filters with:
   ```sql
   CREATE POLICY chunks_select ON chunks FOR SELECT
     USING (allowed_roles && string_to_array(current_setting('app.user_roles', true), ','));
   ```
   When the GUC is unset, `current_setting(..., true)` is NULL and the policy returns **no rows**
   - it fails closed rather than open.

3. **The app connects as a non-superuser role, and the table is FORCE'd.** This is the subtle
   part: a Postgres **superuser (or a role owning the table) bypasses RLS**. So the application
   role is created `NOSUPERUSER NOBYPASSRLS`, and `chunks` is set `FORCE ROW LEVEL SECURITY` so
   the policy applies even to the table owner. Migrations and ingestion run as a separate
   privileged role; the request path never does.

   Reads are gated by the policy above; per-command `INSERT`/`UPDATE`/`DELETE` policies stay
   permissive so ingestion still works without granting any read access.

## Consequences

- The guarantee is demonstrable: a raw `SELECT * FROM chunks` with **no WHERE clause** returns
  only the rows the GUC permits. The app keeps an explicit ACL predicate too (defense in depth),
  but correctness does not depend on it.
- Every answered query is recorded in an append-only `audit_log` (user, roles, query, retrieved
  doc ids, answer hash, latency).
- Operational note: the demo's local Postgres role was demoted to non-superuser so FORCE RLS
  binds; managed Postgres (Neon/Supabase) gives the app a non-superuser role by default.
