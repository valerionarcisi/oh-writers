CREATE TABLE "project_rate_card" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" text,
  "rate_unit" text NOT NULL DEFAULT 'giornata',
  "rate_value" numeric NOT NULL DEFAULT '0',
  "meal_allowance" numeric NOT NULL DEFAULT '0',
  "accommodation" numeric NOT NULL DEFAULT '0',
  "fiscal_regime" text NOT NULL DEFAULT 'piva',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "project_rate_card_project_name_uq" UNIQUE ("project_id", "name")
);
