CREATE TABLE "breakdown_version_state" (
  "version_id" uuid PRIMARY KEY REFERENCES "screenplay_versions"("id") ON DELETE CASCADE,
  "last_full_spoglio_run_at" timestamp,
  "model_used" text,
  "scenes_total" integer,
  "scenes_done" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
