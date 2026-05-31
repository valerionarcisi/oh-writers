-- Spec 51 — persisted Cesare chat messages.
-- One row per user/assistant bubble, FK'd to the parent cesare_sessions thread
-- so a session's conversation survives reload and can be derived into a
-- transcript markdown. `metadata` (jsonb) carries the runtime-only enrichment
-- the chat reducer holds in memory: the live step trace of an assistant turn +
-- the doc-applied / version markers of any edit that turn produced. It is
-- OPTIONAL context for the transcript derivation, never a second source of
-- truth — the authoritative edit record stays document_versions + diff markers.
CREATE TABLE "cesare_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "cesare_sessions"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "cesare_messages_session_idx"
  ON "cesare_messages" ("session_id", "created_at");
