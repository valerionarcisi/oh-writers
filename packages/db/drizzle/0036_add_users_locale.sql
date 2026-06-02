-- Add `users.locale` (i18n, Spec 18b).
--
-- New (international) users default to English. Existing rows are backfilled to
-- 'it' so the current Italian product is preserved for everyone already signed
-- up — the column default ('en') only applies to rows created from here on.
-- IF NOT EXISTS keeps the migration idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" text NOT NULL DEFAULT 'en';

UPDATE "users" SET "locale" = 'it' WHERE "locale" = 'en';
