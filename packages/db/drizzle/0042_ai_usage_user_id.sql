-- Spec 83 (Wave 1) — BYOK preparation. Nullable so existing/unwired call
-- sites (most of Wave 1) keep writing rows without a user; per-user
-- attribution wiring lands with Spec 84.
ALTER TABLE "ai_usage" ADD COLUMN "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- FK without an index would force a full ai_usage scan on every user deletion
-- (ON DELETE SET NULL) — review finding.
CREATE INDEX "ai_usage_user_id_idx" ON "ai_usage" ("user_id");
