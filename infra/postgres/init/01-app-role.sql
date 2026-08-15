-- Make Row-Level Security actually bind for the application role.
--
-- Postgres skips RLS entirely for superusers, and the official image creates
-- POSTGRES_USER as one. FORCE ROW LEVEL SECURITY (migration 0002) covers the
-- table owner but not a superuser, so without this the chunks policy is dead
-- weight and any caller can read every document. See docs/adr/0006.
--
-- Runs once, as the bootstrap superuser, on first initialisation of the data
-- directory. The extension is created here, before the demotion, so migration
-- 0001's CREATE EXTENSION IF NOT EXISTS is a no-op that needs no superuser.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER ROLE rag NOSUPERUSER;

-- Still the database owner, but PG15+ no longer grants CREATE on public
-- implicitly, and Alembic needs it to create the schema.
GRANT CREATE ON SCHEMA public TO rag;
