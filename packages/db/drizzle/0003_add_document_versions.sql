-- ⚠️  Superseded by 0004_universal_versioning.sql.
-- This migration originally created a legacy `document_versions` table with a
-- different shape (had `is_auto`, no `number`/`updated_at`, no unique constraint
-- on (document_id, number)). 0004 creates the canonical schema and is what
-- every consumer expects. On a fresh DB both run in sequence — if we let 0003
-- create the table, 0004 then fails with "relation already exists" because
-- drizzle-kit runs `CREATE TABLE` (no IF NOT EXISTS).
--
-- We keep the journal entry intact so DBs migrated against the historical
-- sequence stay valid, but the statements are now idempotent no-ops that
-- never touch the schema on a fresh DB.

DO $$
BEGIN
  -- Intentionally empty: 0004 is the source of truth for document_versions.
  NULL;
END
$$;
