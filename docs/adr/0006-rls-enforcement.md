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
   part: a Postgres **superuser bypasses RLS entirely**, and `FORCE ROW LEVEL SECURITY` only
   extends the policy to the table *owner*. Both are needed, and the first is easy to lose:
   the official Postgres image creates `POSTGRES_USER` as a superuser, so a stock
   `docker compose up` would have left the policy inert. `chunks` is FORCE'd in migration
   0002, and [`infra/postgres/init/01-app-role.sql`](../../infra/postgres/init/01-app-role.sql)
   demotes the app role on first init. CI reaches the same state explicitly, because service
   containers cannot mount an init script.

   Reads are gated by the policy above; per-command `INSERT`/`UPDATE`/`DELETE` policies stay
   permissive so ingestion still works without granting any read access.

## Consequences

- The guarantee is demonstrable *and tested*: [`backend/tests/test_rls.py`](../../backend/tests/test_rls.py)
  counts rows with **no WHERE clause on roles** and asserts 1/2/3 visible by tier, 0 with the
  GUC unset. It refuses to run against a role that can bypass RLS, because such a test would
  otherwise pass for the wrong reason. The app keeps an explicit ACL predicate too (defense in
  depth), but correctness does not depend on it.
- Every answered query is recorded in an append-only `audit_log` (user, roles, query, retrieved
  doc ids, answer hash, latency).
- Operational note: managed Postgres (Neon/Supabase) gives the app a non-superuser role by
  default. On an *existing* local volume the init script will not re-run, so apply it by hand
  or recreate the volume with `docker compose down -v && make up`. The test above is what
  catches this either way.
