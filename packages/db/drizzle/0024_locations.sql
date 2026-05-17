CREATE TABLE "location_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "breakdown_element_id" uuid REFERENCES "breakdown_elements"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "description" text,
  "int_ext" text,
  "time_of_day" jsonb DEFAULT '[]'::jsonb,
  "confirmed_candidate_id" uuid,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "location_requirement_scenes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requirement_id" uuid NOT NULL REFERENCES "location_requirements"("id") ON DELETE CASCADE,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE
);

CREATE TABLE "location_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requirement_id" uuid NOT NULL REFERENCES "location_requirements"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "address" text,
  "lat" real,
  "lng" real,
  "contact_name" text,
  "contact_email" text,
  "contact_phone" text,
  "estimated_daily_fee" real,
  "permit_required" boolean,
  "permit_notes" text,
  "available_from" date,
  "available_to" date,
  "notes" text,
  "status" text NOT NULL DEFAULT 'candidate',
  "ai_suggested" boolean NOT NULL DEFAULT false,
  "ai_reasoning" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "location_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL REFERENCES "location_candidates"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "caption" text,
  "uploaded_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "location_requirements"
  ADD CONSTRAINT "location_requirements_status_check"
  CHECK (status IN ('pending', 'scouting', 'confirmed', 'locked'));

ALTER TABLE "location_candidates"
  ADD CONSTRAINT "location_candidates_status_check"
  CHECK (status IN ('candidate', 'visited', 'rejected', 'confirmed'));
