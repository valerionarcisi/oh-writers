import { Context, Effect, Layer } from "effect";
import { getDb, type Db } from "~/server/db";

// ─── Db service ────────────────────────────────────────────────────────────────
//
// Wraps the existing `getDb()` (a dynamic import of the Drizzle handle) as an
// Effect Layer. AI Effects that need the database depend on `DbService` in their
// `R` channel instead of plumbing `db` by hand — the "forgot to pass db" class
// of bug becomes a type error.
//
// The handle is a plain singleton (Drizzle manages the underlying pool), so this
// is `Layer.effect`, not `acquireRelease`: there is nothing to tear down here.
// Connection lifecycle stays owned by `@oh-writers/db`.

export interface DbService {
  readonly db: Db;
}

export const DbService = Context.GenericTag<DbService>("ai/DbService");

export const DbLayer = Layer.effect(
  DbService,
  Effect.map(
    Effect.promise(() => getDb()),
    (db) => ({ db }) satisfies DbService,
  ),
);
