ALTER TABLE "breakdown_occurrences"
  ADD COLUMN "source" text CHECK ("source" IN ('regex', 'cesare', 'manual'));
