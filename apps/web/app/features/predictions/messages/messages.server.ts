// apps/web/app/features/predictions/messages/messages.server.ts
// Spec 51 (step 1) — persist + load Cesare chat messages.
//
// Plain neverthrow CRUD (no LLM, no external resource, no retry/lifecycle), so
// per the Spec 48 boundary rule this stays on neverthrow — Effect is reserved
// for the AI loaders. Access is gated through the same session-ownership flow as
// `sessions.server.ts`: resolve the parent session, run the project-view gate,
// then fail closed on a foreign user (unknown id / foreign / cross-project all
// collapse to `CesareSessionNotFoundError`, never leaking which exists).
import { createServerFn } from "@tanstack/start";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { asc, eq } from "drizzle-orm";
import { cesareMessages, cesareSessions } from "@oh-writers/db/schema";
import type { CesareMessageRow, CesareSessionRow } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import { getDb, type Db } from "~/server/db";
import {
  CesareSessionNotFoundError,
  DbError,
} from "../sessions/sessions.errors";
import { ownsSession } from "../sessions/sessions.server";
import { isPlaceholderSessionTitle } from "../sessions/sessions.schema";
import { deriveSessionTitle } from "../sessions/derive-session-title";
import {
  PersistTurnInput,
  ListMessagesInput,
  MessageMetadataSchema,
  type CesareMessage,
  type MessageMetadata,
} from "./messages.schema";

type MessageError = ProjectAccessError | CesareSessionNotFoundError | DbError;

const toMessageError = (e: MessageError): MessageError => e;

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

// The session-ownership gate shared by persist + list: resolve the session,
// run the project-view access pipeline, then apply `ownsSession` (fail closed).
const withOwnedSession = <A>(
  projectId: string,
  sessionId: string,
  run: (ctx: {
    db: Db;
    session: CesareSessionRow;
  }) => ResultAsync<A, MessageError>,
): ResultAsync<A, MessageError> =>
  ResultAsync.fromPromise(getDb(), (e) => new DbError("getDb", e)).andThen(
    (db) =>
      findSessionById(db, sessionId)
        .mapErr(toMessageError)
        .andThen((session) =>
          withProjectAccess(projectId, "view", ({ db: gatedDb, access }) => {
            if (
              !ownsSession(session, {
                userId: access.user.id,
                projectId,
              })
            ) {
              return errAsync(
                toMessageError(new CesareSessionNotFoundError(sessionId)),
              );
            }
            return run({ db: gatedDb, session });
          }),
        ),
  );

const parseMetadata = (raw: unknown): MessageMetadata | null => {
  if (raw === null || raw === undefined) return null;
  const parsed = MessageMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

// The post-turn session update. Always bumps `lastMessageAt` (rail ordering);
// additionally folds in the auto-derived title when the session still carries a
// system placeholder AND the derivation yields a non-empty summary. Pure — no
// I/O — so the "first-turn-only" naming rule lives in one testable place.
const buildSessionUpdate = (
  currentTitle: string,
  firstUserContent: string,
): { lastMessageAt: Date; title?: string } => {
  const base = { lastMessageAt: new Date() };
  if (!isPlaceholderSessionTitle(currentTitle)) return base;
  const derived = deriveSessionTitle(firstUserContent);
  return derived.length > 0 ? { ...base, title: derived } : base;
};

const toWire = (row: CesareMessageRow): CesareMessage => ({
  id: row.id,
  sessionId: row.sessionId,
  role: row.role,
  content: row.content,
  metadata: parseMetadata(row.metadata),
  createdAt: row.createdAt.toISOString(),
});

// ─── Persist one turn (user bubble + assistant reply) ─────────────────────────
// Called by the client once a turn settles. The assistant row carries the live
// trace + edit markers as metadata. We touch the session so the rail's ordering
// stays meaningful — the same side effect `touchSession` performs.

export const persistTurn = createServerFn({ method: "POST" })
  .validator(PersistTurnInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<{ userId: string; assistantId: string }, MessageError>
    > =>
      toShape(
        await withOwnedSession(
          data.projectId,
          data.sessionId,
          ({ db, session }) =>
            ResultAsync.fromPromise(
              db
                .insert(cesareMessages)
                .values([
                  {
                    sessionId: data.sessionId,
                    role: "user" as const,
                    content: data.userContent,
                    metadata: null,
                  },
                  {
                    sessionId: data.sessionId,
                    role: "assistant" as const,
                    content: data.assistantContent,
                    metadata: data.metadata ?? null,
                  },
                ])
                .returning({
                  id: cesareMessages.id,
                  role: cesareMessages.role,
                }),
              (e) => toMessageError(new DbError("persistTurn", e)),
            )
              .andThen((rows) => {
                const userRow = rows.find((r) => r.role === "user");
                const assistantRow = rows.find((r) => r.role === "assistant");
                return userRow && assistantRow
                  ? okAsync({
                      userId: userRow.id,
                      assistantId: assistantRow.id,
                    })
                  : errAsync(
                      toMessageError(new DbError("persistTurn:noReturn", null)),
                    );
              })
              .andThen((ids) =>
                // Keep last_message_at fresh for rail ordering, and — only on the
                // very first turn, while the title is still a system placeholder —
                // derive a Notion-style title from this first request (Spec 53).
                // No extra LLM call: the title is a deterministic summary of the
                // user's own words. A user-renamed title (not a placeholder) is
                // never overwritten; once derived it is no longer a placeholder,
                // so this applies exactly once.
                ResultAsync.fromPromise(
                  db
                    .update(cesareSessions)
                    .set(buildSessionUpdate(session.title, data.userContent))
                    .where(eq(cesareSessions.id, data.sessionId)),
                  (e) => toMessageError(new DbError("persistTurn:touch", e)),
                ).map(() => ids),
              ),
        ),
      ),
  );

// ─── List a session's messages (load on open) ────────────────────────────────

export const listMessages = createServerFn({ method: "GET" })
  .validator(ListMessagesInput)
  .handler(
    async ({ data }): Promise<ResultShape<CesareMessage[], MessageError>> =>
      toShape(
        await withOwnedSession(data.projectId, data.sessionId, ({ db }) =>
          ResultAsync.fromPromise(
            db
              .select()
              .from(cesareMessages)
              .where(eq(cesareMessages.sessionId, data.sessionId))
              .orderBy(asc(cesareMessages.createdAt)),
            (e) => toMessageError(new DbError("listMessages", e)),
          ).map((rows) => rows.map(toWire)),
        ),
      ),
  );
