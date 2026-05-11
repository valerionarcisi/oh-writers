CREATE TABLE "schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL DEFAULT 'Piano di Lavorazione',
  "start_date" date,
  "country_code" text NOT NULL DEFAULT 'IT',
  "status" text NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "schedules_status_check" CHECK (status IN ('draft', 'locked'))
);

CREATE TABLE "shooting_days" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL REFERENCES "schedules"("id") ON DELETE CASCADE,
  "day_number" integer NOT NULL,
  "date" date,
  "day_type" text NOT NULL DEFAULT 'shoot',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "shooting_days_day_type_check" CHECK (day_type IN ('shoot', 'travel', 'rest', 'prep'))
);

CREATE TABLE "strips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL REFERENCES "schedules"("id") ON DELETE CASCADE,
  "shooting_day_id" uuid REFERENCES "shooting_days"("id") ON DELETE SET NULL,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "position" integer NOT NULL DEFAULT 0,
  "banner_color" text NOT NULL DEFAULT 'white',
  "is_locked" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "strips_banner_color_check" CHECK (banner_color IN ('white', 'yellow', 'blue', 'green', 'red', 'pink', 'grey'))
);
