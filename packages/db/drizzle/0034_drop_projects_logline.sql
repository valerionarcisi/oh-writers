-- Drop the dead `projects.logline` column (spec 47c).
--
-- The logline is owned by the `documents` table as a row of type "logline" —
-- the single source of truth (it carries versioning + the agentic edit
-- pattern). The `projects.logline` column was never read by any UI and never
-- written by any caller (every value was NULL); it only shadowed the canonical
-- document and risked a future "two loglines" divergence. IF EXISTS keeps the
-- migration idempotent.
ALTER TABLE "projects" DROP COLUMN IF EXISTS "logline";
