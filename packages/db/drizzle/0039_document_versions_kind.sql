-- Add `document_versions.kind` (BUG-N66 / Spec 76).
--
-- Distinguishes a user-meaningful checkpoint from an in-place Cesare working
-- copy so the Versions list stops flooding (one row per AI turn). Forward-only:
-- the NOT NULL DEFAULT 'manual' makes every existing row a "manual" version,
-- which is correct — rows that predate the checkpoint model are all
-- user-meaningful. No backfill, no data migration of existing versions.
-- IF NOT EXISTS keeps the migration idempotent.
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'manual' NOT NULL;

-- Session identity for checkpoint/working rows (Spec 76). Nullable — "manual"
-- user versions have no owning Cesare session. IF NOT EXISTS because some dev
-- DBs already carry an ad-hoc `cesare_session_id` from an earlier session; this
-- formalises it in the schema + migration history.
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "cesare_session_id" uuid;
