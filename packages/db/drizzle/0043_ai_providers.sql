-- Spec 84 — per-user BYOK provider configuration. One row per user (unique
-- index on user_id): which provider they connected, their API key encrypted
-- at rest, and their chosen model pair. `models` starts NULL — the connect
-- wizard's step 3 sets it from the live catalogue; no model ID is ever
-- hardcoded as a default (Spec 84 §3).
CREATE TABLE "ai_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "api_key_encrypted" text NOT NULL,
  "key_last4" text NOT NULL,
  "models" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_user_id_key" ON "ai_providers" ("user_id");
