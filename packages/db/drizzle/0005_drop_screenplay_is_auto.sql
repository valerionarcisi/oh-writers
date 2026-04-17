-- Spec 06b block 4 — remove the legacy auto-versioning flag. All versions
-- are now user-created (manual), tracked by `number`; the UI no longer
-- distinguishes "auto" from "manual".

ALTER TABLE "screenplay_versions" DROP COLUMN IF EXISTS "is_auto";
