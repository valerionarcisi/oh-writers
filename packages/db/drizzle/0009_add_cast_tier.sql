ALTER TABLE "breakdown_elements"
  ADD COLUMN "cast_tier" text;

ALTER TABLE "breakdown_elements"
  ADD CONSTRAINT "breakdown_elements_cast_tier_chk"
  CHECK ("cast_tier" IS NULL OR "cast_tier" IN ('principal','supporting','day_player','featured_extra'));

ALTER TABLE "breakdown_elements"
  ADD CONSTRAINT "breakdown_elements_cast_tier_only_for_cast_chk"
  CHECK ("cast_tier" IS NULL OR "category" = 'cast');
