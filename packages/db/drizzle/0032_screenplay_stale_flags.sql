-- Stale flags on screenplays: set to true when the active version changes
-- (promote draft or restore). Each feature clears its own flag on sync.
ALTER TABLE "screenplays"
  ADD COLUMN "breakdown_stale" boolean NOT NULL DEFAULT false,
  ADD COLUMN "locations_stale" boolean NOT NULL DEFAULT false,
  ADD COLUMN "budget_stale"    boolean NOT NULL DEFAULT false,
  ADD COLUMN "schedule_stale"  boolean NOT NULL DEFAULT false;
