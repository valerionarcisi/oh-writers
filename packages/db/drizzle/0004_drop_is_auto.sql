-- ⚠️  Superseded by 0004_universal_versioning.sql.
--
-- This file originally dropped the legacy `is_auto` column added by the
-- (now no-op) 0003_add_document_versions migration. On a fresh DB the
-- column never exists — 0004_universal_versioning creates the canonical
-- `document_versions` table without it — so this migration has nothing
-- to do. Established DBs already have the file in `__drizzle_migrations`
-- and skip it.
--
-- The `screenplay_versions.is_auto` column is dropped by the canonical
-- 0005_drop_screenplay_is_auto migration. Leave that work to 0005.

SELECT 1;
