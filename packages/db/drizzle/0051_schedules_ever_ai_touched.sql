-- Spec 89 (AI disclosure stamp). Set true the first time a Cesare tool
-- (move_scene_to_day, merge_days, swap_scenes, suggest_reorder) mutates any
-- strip/day of this schedule, and NEVER reset. One flag per schedule, not
-- per strip/day — Cesare tools mutate multiple rows in one call.
--
-- No backfill: like screenplay_versions, this schedule never had ANY
-- AI-provenance signal before this column existed — no historical data to
-- recover, so pre-existing schedules stay false (not a mass false positive).
ALTER TABLE "schedules" ADD COLUMN "ever_ai_touched" boolean DEFAULT false NOT NULL;
