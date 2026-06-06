-- Add `document_versions.draft_color` + `document_versions.draft_date` (Spec 66).
--
-- Unify narrative versioning with the screenplay's richer meta: the master→detail
-- Versions surface lets a writer label a narrative version with a stable draft
-- colour dot and an optional draft date, exactly as `screenplay_versions` already
-- carries them. Both columns are nullable — existing rows stay un-coloured / un-dated.
-- IF NOT EXISTS keeps the migration idempotent.
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "draft_color" text;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "draft_date" date;
