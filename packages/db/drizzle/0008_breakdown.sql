CREATE TABLE "breakdown_elements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "breakdown_elements_project_category_name_uq" UNIQUE ("project_id", "category", "name")
);

CREATE TABLE "breakdown_occurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "element_id" uuid NOT NULL REFERENCES "breakdown_elements"("id") ON DELETE CASCADE,
  "screenplay_version_id" uuid NOT NULL REFERENCES "screenplay_versions"("id") ON DELETE CASCADE,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "quantity" integer DEFAULT 1 NOT NULL,
  "note" text,
  "cesare_status" text DEFAULT 'accepted' NOT NULL,
  "is_stale" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "breakdown_occurrences_element_version_scene_uq" UNIQUE ("element_id", "screenplay_version_id", "scene_id")
);

CREATE TABLE "breakdown_scene_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "screenplay_version_id" uuid NOT NULL REFERENCES "screenplay_versions"("id") ON DELETE CASCADE,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "text_hash" text NOT NULL,
  "last_cesare_run_at" timestamp,
  "page_eighths" integer,
  CONSTRAINT "breakdown_scene_state_version_scene_uq" UNIQUE ("screenplay_version_id", "scene_id")
);

CREATE TABLE "breakdown_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "last_invoked_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "breakdown_rate_limits_project_action_uq" UNIQUE ("project_id", "action")
);
