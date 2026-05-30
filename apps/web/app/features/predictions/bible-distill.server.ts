import { Effect, Layer } from "effect";
import type { ResultAsync } from "neverthrow";
import { type FilmBible } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { DbError } from "@oh-writers/utils";
import { AiClientLayer, DbService, toResultAsync } from "~/server/effect";
import {
  BibleDistillError,
  computeBibleFingerprint,
  loadFilmBibleEffect,
} from "./bible-distill.effect";

// ─── Spec 48 W-E5 ──────────────────────────────────────────────────────────────
//
// This module is the neverthrow-facing seam for the Film Bible distiller. The
// real logic now lives in `bible-distill.effect.ts` (Sonnet forced-tool call
// routed through the `AiClient` Layer, db from the `DbService` Layer, concurrent
// independent reads). Here we provide those Layers around an existing `db` handle
// and bridge the Effect result back to `ResultAsync` so every caller
// (`global-context.server.ts`, `cesare.server.ts`) is untouched. Re-exports keep
// the public surface (`BibleDistillError`, `computeBibleFingerprint`) identical.

export { BibleDistillError, computeBibleFingerprint };

/**
 * Return the current Film Bible for the project.
 * - No row → distill synchronously (first-time setup).
 * - Fingerprint matches → return cached row immediately.
 * - Fingerprint mismatch → return existing row; re-distill in background.
 *
 * External contract unchanged:
 * `ResultAsync<FilmBible, DbError | BibleDistillError>`. The model call is now
 * routed through the AiClient Layer and the independent DB reads run
 * concurrently — neither changes the returned value.
 */
export const loadFilmBible = (
  db: Db,
  projectId: string,
): ResultAsync<FilmBible, DbError | BibleDistillError> =>
  toResultAsync(
    loadFilmBibleEffect(projectId).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(DbService, { db }), AiClientLayer),
      ),
    ),
  );
