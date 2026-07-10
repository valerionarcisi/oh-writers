-- LeftRail Cesare-sessions pinning. `pinned_at` is nullable: NULL means the
-- session is not pinned, a timestamp means it was pinned at that moment (and
-- doubles as the pinned-list ordering key — pinned sessions sort by pinned_at
-- desc, most-recently-pinned first). Capped at 3 pinned sessions per project,
-- enforced in the server function (not a CHECK constraint, since a CHECK
-- can't count sibling rows).
ALTER TABLE "cesare_sessions" ADD COLUMN "pinned_at" timestamp with time zone;
