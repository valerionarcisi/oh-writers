import { Effect, Layer } from "effect";
import type { ResultAsync } from "neverthrow";
import { okAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { scenes } from "@oh-writers/db/schema";
import { SceneSummarySchema, type SceneSummary } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { DbError } from "@oh-writers/utils";
import {
  AiClient,
  AiClientLayer,
  DbService,
  toResultAsync,
} from "~/server/effect";
import {
  SceneSummaryError,
  fingerprintBody,
  generateSceneSummaryEffect,
  refreshStaleSceneSummariesEffect,
} from "./scene-summary.effect";

// ─── Spec 48 W-E5 ──────────────────────────────────────────────────────────────
//
// This module is the neverthrow-facing seam for the scene-summary distiller. The
// real logic now lives in `scene-summary.effect.ts` (model call routed through
// the `AiClient` Layer, db from the `DbService` Layer, bounded-concurrency
// refresh). Here we provide those Layers around an existing `db` handle and
// bridge the Effect result back to the canonical `ResultAsync` so every caller
// (`screenplay.server.ts`) is untouched. Re-exports keep the public surface
// (`SceneSummaryError`, `fingerprintBody`) byte-identical.

export { SceneSummaryError, fingerprintBody };
export type { SceneSummary };

// Bind an AI distiller Effect to a concrete `db` handle + the AiClient Layer and
// surface it as a `ResultAsync`. The Db Layer is `Layer.succeed` over the passed
// handle (the caller owns the connection); the AiClient Layer carries the W-E3
// retry/timeout policy. This is the one place the Effect↔neverthrow boundary is
// crossed for this distiller.
const runWithDb = <A, E>(
  db: Db,
  effect: Effect.Effect<A, E, AiClient | DbService>,
): ResultAsync<A, E> =>
  toResultAsync(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(DbService, { db }), AiClientLayer),
      ),
    ),
  );

/**
 * Generate one structured scene summary. Same external contract as before:
 * `ResultAsync<SceneSummary, SceneSummaryError>`, mock fixture under `MOCK_AI`,
 * same Zod validation and logging — now routed through the AiClient Layer.
 */
export const generateSceneSummary = (
  sceneNumber: number,
  heading: string,
  body: string,
): ResultAsync<SceneSummary, SceneSummaryError> =>
  toResultAsync(
    generateSceneSummaryEffect(sceneNumber, heading, body).pipe(
      Effect.provide(AiClientLayer),
    ),
  );

// ─── Debounce guard ───────────────────────────────────────────────────────────

// In-process debounce: don't start a second refresh while one is already running
// for the same screenplay. Simple Set — good enough for a single Node.js process.
const inFlight = new Set<string>();

const runRefresh = (
  db: Db,
  screenplayId: string,
): ResultAsync<number, DbError | SceneSummaryError> => {
  if (inFlight.has(screenplayId)) return okAsync(0);
  inFlight.add(screenplayId);

  return runWithDb(db, refreshStaleSceneSummariesEffect(screenplayId))
    .map((count) => {
      inFlight.delete(screenplayId);
      return count;
    })
    .mapErr((e) => {
      inFlight.delete(screenplayId);
      return e;
    });
};

export const SCENE_SUMMARY_DEBOUNCE_MS = 60_000;

/**
 * Leading + trailing debounce keyed by an arbitrary string id. The FIRST
 * {@link schedule} for an idle key runs immediately — a process restart or
 * redeploy inside the window can therefore lose at most the tail of a burst,
 * never a lone save (review finding, Spec 83 W1). Further calls within the
 * window collapse into ONE trailing run, `delayMs` after the last one — a
 * burst of N saves costs two runs (leading + trailing), not N (Spec 83 —
 * ambient cost driver). Timer functions are injectable so tests can drive it
 * with fake timers without a real `setTimeout`/`clearTimeout` pair.
 */
export const createKeyedTrailingDebounce = (
  delayMs: number,
  timers: {
    set: typeof setTimeout;
    clear: typeof clearTimeout;
  } = { set: setTimeout, clear: clearTimeout },
) => {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule: (key: string, run: () => void): void => {
      const existing = pending.get(key);
      if (existing === undefined) {
        run();
        // Park a no-op window so the next save within delayMs becomes a
        // trailing run instead of another immediate one.
        const handle = timers.set(() => {
          pending.delete(key);
        }, delayMs);
        pending.set(key, handle);
        return;
      }
      timers.clear(existing);
      const handle = timers.set(() => {
        pending.delete(key);
        run();
      }, delayMs);
      pending.set(key, handle);
    },
    pendingCount: (): number => pending.size,
  };
};

// Composes with `inFlight` above rather than replacing it: the debounce timer
// decides WHEN to start a run, `inFlight` still guards against two overlapping
// runs (e.g. a run that takes longer than the debounce window).
const sceneSummaryDebounce = createKeyedTrailingDebounce(
  SCENE_SUMMARY_DEBOUNCE_MS,
);

/**
 * Find every scene in the screenplay whose body hash differs from the stored
 * fingerprint (or has no summary yet) and regenerate those summaries with
 * bounded concurrency. Fire-and-forget from the save path — errors are logged,
 * not thrown. Debounced 60s trailing per screenplay: callers no longer get a
 * `ResultAsync` they can await for the actual run, since the run itself may
 * not start for up to `SCENE_SUMMARY_DEBOUNCE_MS`.
 */
export const refreshStaleSceneSummaries = (
  db: Db,
  screenplayId: string,
): void => {
  sceneSummaryDebounce.schedule(screenplayId, () => {
    void runRefresh(db, screenplayId);
  });
};

// ─── Load summaries for distillation ─────────────────────────────────────────
//
// A plain DB read (no LLM, no concurrency to win) — stays on neverthrow per the
// ADR boundary rule (simple CRUD reads do not move to Effect). Kept here as a
// thin Effect-bridged read so the whole distiller speaks one error model.

export interface SceneSummaryWithFingerprint {
  readonly sceneId: string;
  readonly summary: SceneSummary;
  readonly fingerprint: string;
}

export const loadSceneSummaries = (
  db: Db,
  screenplayId: string,
): ResultAsync<SceneSummaryWithFingerprint[], DbError> =>
  toResultAsync(
    Effect.tryPromise({
      try: () =>
        db
          .select({
            id: scenes.id,
            sceneSummary: scenes.sceneSummary,
            sceneSummaryFingerprint: scenes.sceneSummaryFingerprint,
          })
          .from(scenes)
          .where(eq(scenes.screenplayId, screenplayId)),
      catch: (e) => new DbError("loadSceneSummaries", e),
    }).pipe(
      Effect.map((rows) =>
        rows
          .filter(
            (
              r,
            ): r is typeof r & {
              sceneSummary: unknown;
              sceneSummaryFingerprint: string;
            } => r.sceneSummary !== null && r.sceneSummaryFingerprint !== null,
          )
          .flatMap((r) => {
            const parsed = SceneSummarySchema.safeParse(r.sceneSummary);
            if (!parsed.success) return [];
            return [
              {
                sceneId: r.id,
                summary: parsed.data,
                fingerprint: r.sceneSummaryFingerprint,
              },
            ];
          }),
      ),
    ),
  );
