ALTER TABLE "projects"
  ADD COLUMN "locale" text NOT NULL DEFAULT 'it';

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_locale_chk"
  CHECK ("locale" IN ('en', 'it'));
