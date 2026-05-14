CREATE TABLE "locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "template_key" text NOT NULL DEFAULT 'empty',
  "grid_size" integer NOT NULL DEFAULT 50,
  "width_cm" integer NOT NULL DEFAULT 1000,
  "height_cm" integer NOT NULL DEFAULT 800,
  "primitives" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "scene_blockings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "location_id" uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "actor_positions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_suggested" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "plan_scene_cameras" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "shot_plan_scenarios"("id") ON DELETE CASCADE,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "camera_pins" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "detached_actors" boolean NOT NULL DEFAULT false,
  "override_actor_positions" jsonb DEFAULT NULL,
  "is_suggested" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX ON "locations"("project_id");
CREATE INDEX ON "scene_blockings"("scene_id");
CREATE INDEX ON "plan_scene_cameras"("plan_id");
CREATE INDEX ON "plan_scene_cameras"("scene_id");
