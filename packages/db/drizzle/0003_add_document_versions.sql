-- ⚠️  Superseded by 0004_universal_versioning.sql.
--
-- The original 0003 created a legacy `document_versions` table with a
-- different shape (had `is_auto`, no `number`/`updated_at`). 0004 is the
-- canonical schema and runs `CREATE TABLE document_versions` straight away.
-- On fresh DBs both files run in sequence — if we let the legacy CREATE go
-- through, 0004 then trips on "relation already exists".
--
-- Drop the journal entry by making this migration a deterministic no-op so
-- it leaves the schema untouched on a fresh DB. Established DBs already
-- have the file in `__drizzle_migrations` and will skip it altogether.

SELECT 1;
