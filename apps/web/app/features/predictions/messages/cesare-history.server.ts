// apps/web/app/features/predictions/messages/cesare-history.server.ts
// Spec 51 (steps 2 + 3) — createServerFn boundary for the DERIVED history
// markdown. Access is gated through the same session-ownership flow as
// `messages.server.ts`; the DERIVED sources are loaded by the Effect loaders
// (`cesare-history.effect.ts`) and rendered by the PURE domain builders. The
// boundary returns the canonical ResultShape.
import { createServerFn } from "@tanstack/start";
import { Effect, Layer } from "effect";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { cesareSessions } from "@oh-writers/db/schema";
import type { CesareSessionRow } from "@oh-writers/db/schema";
import {
  buildEditChangelogListMarkdown,
  buildSessionTranscriptMarkdown,
  buildHistoryContextSummary,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import { getDb, type Db } from "~/server/db";
import { DbService, toResultAsync } from "~/server/effect";
import {
  CesareSessionNotFoundError,
  DbError,
} from "../sessions/sessions.errors";
import { ownsSession } from "../sessions/sessions.server";
import { CesareError } from "../cesare.errors";
import {
  buildSessionEditSourcesEffect,
  buildSessionTranscriptSourceEffect,
  buildProjectHistorySourcesEffect,
} from "./cesare-history.effect";
import { SessionHistoryInput } from "./messages.schema";

// How many recent project edits to carry into the prompt as bounded context.
// The pure summary lists the most recent ones in detail and folds the rest into
// a count, so this caps the query, not the prompt size directly.
const HISTORY_CONTEXT_EDIT_LIMIT = 20;

type HistoryError =
  | ProjectAccessError
  | CesareSessionNotFoundError
  | DbError
  | CesareError;

const toHistoryError = (e: HistoryError): HistoryError => e;

const findSessionById = (
  db: Db,
  id: string,
): ResultAsync<CesareSessionRow, CesareSessionNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(cesareSessions)
      .where(eq(cesareSessions.id, id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new DbError("findSessionById", e) as CesareSessionNotFoundError | DbError,
  ).andThen((row) =>
    row
      ? okAsync(row)
      : errAsync(
          new CesareSessionNotFoundError(id) as
            | CesareSessionNotFoundError
            | DbError,
        ),
  );

// Run a DbService-only Effect against a gated db handle, bridging to ResultAsync.
const runWithDb = <A>(
  db: Db,
  effect: Effect.Effect<A, CesareError, DbService>,
): ResultAsync<A, CesareError> =>
  toResultAsync(effect.pipe(Effect.provide(Layer.succeed(DbService, { db }))));

const withOwnedSession = <A>(
  projectId: string,
  sessionId: string,
  run: (db: Db) => ResultAsync<A, HistoryError>,
): ResultAsync<A, HistoryError> =>
  ResultAsync.fromPromise(getDb(), (e) => new DbError("getDb", e)).andThen(
    (db) =>
      findSessionById(db, sessionId)
        .mapErr(toHistoryError)
        .andThen((session) =>
          withProjectAccess(projectId, "view", ({ db: gatedDb, access }) => {
            if (!ownsSession(session, { userId: access.user.id, projectId })) {
              return errAsync(
                toHistoryError(new CesareSessionNotFoundError(sessionId)),
              );
            }
            return run(gatedDb);
          }),
        ),
  );

// ─── Bounded history context (step 4) ─────────────────────────────────────────
// Server-side helper (no createServerFn) for cesare.server.ts's V2 handler,
// which already holds a gated `db`. Returns the BOUNDED markdown summary of
// recent project edits, or null when there is no history yet (caller omits the
// block). Failures degrade to null so history NEVER breaks a live turn.
export const loadHistoryContextSummary = (
  db: Db,
  projectId: string,
): ResultAsync<string | null, never> =>
  runWithDb(
    db,
    buildProjectHistorySourcesEffect(projectId, HISTORY_CONTEXT_EDIT_LIMIT),
  )
    .map((sources) => buildHistoryContextSummary(sources))
    .orElse(() => okAsync(null));

// ─── Per-edit changelog markdown (DERIVED) ────────────────────────────────────

export const getSessionChangelogMarkdown = createServerFn({ method: "GET" })
  .validator(SessionHistoryInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ markdown: string }, HistoryError>> =>
      toShape(
        await withOwnedSession(data.projectId, data.sessionId, (db) =>
          runWithDb(db, buildSessionEditSourcesEffect(data.sessionId))
            .mapErr(toHistoryError)
            .map((sources) => ({
              markdown: buildEditChangelogListMarkdown(sources),
            })),
        ),
      ),
  );

// ─── Per-session transcript markdown (DERIVED) ────────────────────────────────

export const getSessionTranscriptMarkdown = createServerFn({ method: "GET" })
  .validator(SessionHistoryInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ markdown: string }, HistoryError>> =>
      toShape(
        await withOwnedSession(data.projectId, data.sessionId, (db) =>
          runWithDb(db, buildSessionTranscriptSourceEffect(data.sessionId))
            .mapErr(toHistoryError)
            .map((source) => ({
              markdown: buildSessionTranscriptMarkdown(source),
            })),
        ),
      ),
  );
