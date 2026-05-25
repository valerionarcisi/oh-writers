CREATE TABLE "fundraising_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "feed_url" text NOT NULL,
  "kind" text NOT NULL,
  "language" text NOT NULL DEFAULT 'it',
  "is_curated" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "team_id" uuid REFERENCES "teams"("id") ON DELETE CASCADE,
  "last_fetched_at" timestamp,
  "last_error" text,
  "etag" text,
  "last_modified" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fundraising_sources_feed_team_unique" UNIQUE("feed_url","team_id"),
  CONSTRAINT "fundraising_sources_kind_check" CHECK (kind IN ('substack','wordpress','generic_rss','atom'))
);

CREATE INDEX "fundraising_sources_team_idx" ON "fundraising_sources" ("team_id");

CREATE TABLE "fundraising_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "fundraising_sources"("id") ON DELETE CASCADE,
  "guid" text NOT NULL,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "published_at" timestamp,
  "raw_html" text NOT NULL DEFAULT '',
  "raw_text" text NOT NULL DEFAULT '',
  "fetched_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fundraising_items_source_guid_unique" UNIQUE("source_id","guid")
);

CREATE INDEX "fundraising_items_published_idx" ON "fundraising_items" ("published_at");

CREATE TABLE "fundraising_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL UNIQUE REFERENCES "fundraising_items"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL DEFAULT '',
  "organization" text,
  "deadline_at" timestamp,
  "deadline_text" text,
  "amount_min" numeric(12,2),
  "amount_max" numeric(12,2),
  "amount_text" text,
  "eligibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requirements" text,
  "link" text NOT NULL,
  "status" text NOT NULL DEFAULT 'unknown',
  "confidence" numeric(3,2) NOT NULL DEFAULT 0,
  "classified_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fundraising_opportunities_kind_check" CHECK (kind IN ('bando_pubblico','call_festival','residenza','grant_privato','workshop','pitch_forum','other')),
  CONSTRAINT "fundraising_opportunities_status_check" CHECK (status IN ('active','expired','unknown'))
);

CREATE INDEX "fundraising_opportunities_status_idx" ON "fundraising_opportunities" ("status");
CREATE INDEX "fundraising_opportunities_deadline_idx" ON "fundraising_opportunities" ("deadline_at");
CREATE INDEX "fundraising_opportunities_kind_idx" ON "fundraising_opportunities" ("kind");

CREATE TABLE "fundraising_saves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL REFERENCES "fundraising_opportunities"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "state" text NOT NULL,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fundraising_saves_opportunity_project_unique" UNIQUE("opportunity_id","project_id"),
  CONSTRAINT "fundraising_saves_state_check" CHECK (state IN ('saved','dismissed','applied'))
);

CREATE INDEX "fundraising_saves_project_idx" ON "fundraising_saves" ("project_id");
