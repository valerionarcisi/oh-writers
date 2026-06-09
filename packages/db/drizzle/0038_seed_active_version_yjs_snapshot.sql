-- Backfill the active screenplay version's Yjs CRDT snapshot (Spec — per-version
-- rooms).
--
-- The screenplay content is collaborative (Yjs) and was historically persisted
-- in a single screenplay-level room (`screenplays.yjs_state`), while the version
-- rows carried no CRDT (`screenplay_versions.yjs_snapshot` was always NULL). Now
-- each active version is its own CRDT room persisted in the version's snapshot.
-- Without this backfill, opening an existing screenplay version-scoped would find
-- a NULL snapshot and show a blank editor (the real content sitting unreachable
-- in `screenplays.yjs_state`).
--
-- Seed every active version's snapshot from its screenplay's live CRDT, only when
-- the version has no snapshot yet. Idempotent.
UPDATE "screenplay_versions" AS sv
SET "yjs_snapshot" = s."yjs_state"
FROM "screenplays" AS s
WHERE sv."id" = s."current_version_id"
  AND sv."yjs_snapshot" IS NULL
  AND s."yjs_state" IS NOT NULL;
