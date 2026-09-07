-- Spec 89 (AI disclosure stamp). Set true the first time ANY occurrence of
-- this element is ever Cesare-sourced, and NEVER reset — a later manual
-- correction of that occurrence must not erase the fact that Cesare touched
-- it once. Deliberately independent of the live breakdown_occurrences.source
-- column, which only reflects current state, not history.
ALTER TABLE "breakdown_elements" ADD COLUMN "ever_ai_touched" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: elements that ALREADY have a Cesare-sourced occurrence today
-- must not silently start "un-touched" just because the column is new.
UPDATE "breakdown_elements"
SET "ever_ai_touched" = true
WHERE "id" IN (
  SELECT DISTINCT "element_id" FROM "breakdown_occurrences" WHERE "source" = 'cesare'
);
