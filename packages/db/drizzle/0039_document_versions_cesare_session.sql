-- Add `document_versions.cesare_session_id` (Spec 75 / BUG-N66).
--
-- Non-null marks the row as the Cesare WORKING VERSION of that chat session's
-- turn group: consecutive Cesare edits from the same session overwrite it in
-- place instead of inserting a new version (one checkpoint per turn group).
-- Cleared when the user claims the version (rename / meta update) and when the
-- session row is deleted. Nullable — every existing row stays user-owned.
-- IF NOT EXISTS keeps the migration idempotent.
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "cesare_session_id" uuid;
DO $$ BEGIN
  ALTER TABLE "document_versions"
    ADD CONSTRAINT "document_versions_cesare_session_id_cesare_sessions_id_fk"
    FOREIGN KEY ("cesare_session_id") REFERENCES "cesare_sessions"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
