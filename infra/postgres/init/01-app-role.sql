-- Make Row-Level Security actually bind for the application role.
--
-- Postgres skips RLS entirely for superusers, and FORCE ROW LEVEL SECURITY
-- (migration 0002) only extends the policy to the table owner. So the app must
-- never connect as a superuser. The image makes POSTGRES_USER the bootstrap
-- superuser, which Postgres refuses to demote, so the app gets its own ordinary
-- role that owns its own database instead. See docs/adr/0006.
--
-- Runs as the bootstrap superuser: once by the image on first initialisation of
-- the data directory, and explicitly in CI (psql -f). The extension is created
-- here because pgvector is not a trusted extension, which makes migration 0001's
-- CREATE EXTENSION IF NOT EXISTS a no-op for the app role. On PG15+ the database
-- owner already has CREATE on schema public, so no grant is needed.

CREATE ROLE rag LOGIN PASSWORD 'rag';
CREATE DATABASE rag OWNER rag;

\connect rag
CREATE EXTENSION IF NOT EXISTS vector;
