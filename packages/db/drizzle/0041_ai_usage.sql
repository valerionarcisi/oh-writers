-- Spec 83 (Wave 1) — the AI cost ledger. One row per real (non-mock) model
-- call: what triggered it, which model, and the computed cost. Backs the
-- daily budget guard and the pnpm ai:costs report.
CREATE TABLE "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "operation" text NOT NULL,
  "model" text NOT NULL,
  "trigger" text NOT NULL,
  "input_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "cache_read_tokens" integer NOT NULL DEFAULT 0,
  "cache_write_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" numeric(10, 6) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" ("created_at");
