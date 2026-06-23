# 3. Postgres + pgvector with Row-Level Security for RBAC

- **Status:** Accepted
- **Date:** 2026-06-23

## Context

The headline enterprise feature is preventing RAG data-exfiltration: a user must never
retrieve a chunk they aren't authorized to see. A common approach applies an access filter
in application code - but a single buggy query then leaks data.

## Decision

Use **one datastore: Postgres + pgvector**, and enforce access with **Row-Level Security
(RLS)** policies on the `chunks` table. Per request we set the caller's roles/clearance on
the transaction (`SET LOCAL app.user_roles = …`); the RLS policy filters every read. Hybrid
search (dense `<=>` + sparse text rank) and the ACL filter run in the same SQL.

We considered Qdrant (+ Redis). It is excellent, but for this project it adds two services
and moves the access check into payload filters (still app-trust). RLS makes the **database
itself** the enforcement point - a stronger and more demonstrable security story - while
collapsing three datastores into one.

## Consequences

- Defense in depth: even an incorrect application query cannot leak unauthorized rows.
- Simpler local + cloud footprint (one DB; managed Neon/Supabase in the cloud).
- We rely on Postgres for vector search; at very large scale a dedicated vector DB may be
  reconsidered (revisit if/when needed).
