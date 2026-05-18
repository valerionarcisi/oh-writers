CREATE TABLE "production_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "value" numeric NOT NULL,
  "unit" text NOT NULL DEFAULT 'day',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "production_rates_project_key_uq" UNIQUE("project_id","key")
);

CREATE INDEX "production_rates_project_key_idx" ON "production_rates" ("project_id","key");
