ALTER TABLE "screenplay_versions" ADD COLUMN "draft_color" text;
ALTER TABLE "screenplay_versions" ADD COLUMN "draft_date" date;

-- v1 of every screenplay is the first draft (white). All higher versions
-- start NULL and get a color either via suggestNextColor at the next
-- create/duplicate, or via an explicit edit from the versions drawer.
UPDATE "screenplay_versions" SET "draft_color" = 'white' WHERE "number" = 1;

-- Backfill from legacy projects.title_page_draft_* onto the *current*
-- version of each project's screenplay, only when the version still has
-- no color/date set (so we don't overwrite the v1=white default unless
-- the project explicitly recorded a color).
UPDATE "screenplay_versions" sv
SET "draft_color" = COALESCE(p."title_page_draft_color", sv."draft_color"),
    "draft_date"  = COALESCE(p."title_page_draft_date",  sv."draft_date")
FROM "screenplays" s
JOIN "projects"    p ON p."id" = s."project_id"
WHERE sv."id" = s."current_version_id"
  AND (p."title_page_draft_color" IS NOT NULL
       OR p."title_page_draft_date"  IS NOT NULL);
