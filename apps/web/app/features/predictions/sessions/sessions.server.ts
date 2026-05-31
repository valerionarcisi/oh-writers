// apps/web/app/features/predictions/sessions/sessions.server.ts
// Spec 44 WP-B — Cesare sessions CRUD via `createServerFn` + `withProjectAccess`.
//
// Sessions are scoped to (project × user). The list/create paths gate on
// project-view permission; rename/delete/touch re-resolve the parent project
// by id so the same access pipeline runs without extra columns in the input.
import { createServerFn } from "@tanstack/start";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { and, desc, eq } from "drizzle-orm";
import { cesareSessions } from "@oh-writers/db/schema";
import type { CesareSessionRow } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import { getDb, type Db } from "~/server/db";
import {
  ListSessionsInput,
  CreateSessionInput,
  RenameSessionInput,
  DeleteSessionInput,
  TouchSessionInput,
  GetSessionInput,
  DEFAULT_NEW_SESSION_TITLE,
  DEFAULT_PRIMARY_SESSION_TITLE,
  type CesareSession,
} from "./sessions.schema";
import { CesareSessionNotFoundError, DbError } from "./sessions.errors";

// ─── Ownership guard ─────────────────────────────────────────────────────────
// Pure predicate so the central `/sessions/:sessionId` route's access decision
// can be unit-tested without a DB. The session is reachable ONLY when it
// belongs to the requesting user AND to the project named in the URL. Both
// checks fail closed: any mismatch is treated as "not found" so we never leak
// whether a foreign session exists or which project owns it.
export const ownsSession = (
  session: { userId: string; projectId: string },
  request: { userId: string; projectId: string },
): boolean =>
  session.userId === request.userId && session.projectId === request.projectId;

// ─── Shared helpers ──────────────────────────────────────────────────────────

const toWire = (row: CesareSessionRow): CesareSession => ({
  id: row.id,
  projectId: row.projectId,
  userId: row.userId,
  title: row.title,
  lastMessageAt: row.lastMessageAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

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

const ensureDefaultSession = (
  db: Db,
  projectId: string,
  userId: string,
): ResultAsync<CesareSessionRow, DbError> =>
  ResultAsync.fromPromise(
    db
      .insert(cesareSessions)
      .values({
        projectId,
        userId,
        title: DEFAULT_PRIMARY_SESSION_TITLE,
      })
      .returning(),
    (e) => new DbError("ensureDefaultSession", e),
  ).andThen((rows) => {
    const row = rows[0];
    return row
      ? okAsync(row)
      : errAsync(new DbError("ensureDefaultSession:noReturn", null));
  });

// ─── List ────────────────────────────────────────────────────────────────────

export const listSessions = createServerFn({ method: "GET" })
  .validator(ListSessionsInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<CesareSession[], ProjectAccessError | DbError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            db
              .select()
              .from(cesareSessions)
              .where(
                and(
                  eq(cesareSessions.projectId, data.projectId),
                  eq(cesareSessions.userId, access.user.id),
                ),
              )
              .orderBy(desc(cesareSessions.lastMessageAt)),
            (e) => new DbError("listSessions", e),
          )
            .andThen((rows) => {
              if (rows.length > 0) return okAsync(rows);
              // First-time access: lazily provision the Default session so the
              // UI never shows an empty list. Matches the migration seed for
              // projects that existed before the schema landed.
              return ensureDefaultSession(
                db,
                data.projectId,
                access.user.id,
              ).map((row) => [row]);
            })
            .map((rows) => rows.map(toWire)),
        ),
      ),
  );

// ─── Get one (central session route) ─────────────────────────────────────────
// Powers `/projects/:id/sessions/:sessionId`. Resolves the row, runs the
// project-view gate, then applies the `ownsSession` guard. Ownership failures
// (unknown id, foreign user, cross-project) collapse to a single
// `CesareSessionNotFoundError`; a denied project gate surfaces a
// `ProjectAccessError`. Both are error results, and the route renders the same
// not-found body for any error — so the ownership case is never distinguishable
// from "no access" on the wire.

export const getSession = createServerFn({ method: "GET" })
  .validator(GetSessionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        CesareSession,
        ProjectAccessError | CesareSessionNotFoundError | DbError
      >
    > => {
      const db = await getDb();
      const result = await findSessionById(db, data.id).andThen((row) =>
        withProjectAccess(data.projectId, "view", ({ access }) => {
          if (
            !ownsSession(row, {
              userId: access.user.id,
              projectId: data.projectId,
            })
          ) {
            return errAsync(
              new CesareSessionNotFoundError(data.id) as
                | CesareSessionNotFoundError
                | DbError,
            );
          }
          return okAsync(toWire(row));
        }),
      );
      return toShape(result);
    },
  );

// ─── Create ──────────────────────────────────────────────────────────────────

export const createSession = createServerFn({ method: "POST" })
  .validator(CreateSessionInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<CesareSession, ProjectAccessError | DbError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            db
              .insert(cesareSessions)
              .values({
                projectId: data.projectId,
                userId: access.user.id,
                title: data.title ?? DEFAULT_NEW_SESSION_TITLE,
              })
              .returning(),
            (e) => new DbError("createSession", e),
          ).andThen((rows) => {
            const row = rows[0];
            return row
              ? okAsync(toWire(row))
              : errAsync(new DbError("createSession:noReturn", null));
          }),
        ),
      ),
  );

// ─── Rename ──────────────────────────────────────────────────────────────────

export const renameSession = createServerFn({ method: "POST" })
  .validator(RenameSessionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        CesareSession,
        ProjectAccessError | CesareSessionNotFoundError | DbError
      >
    > => {
      // We have only the session id, so look it up first to discover the
      // parent project, then run the access gate. The pattern matches the
      // child-entity flow documented in `docs/conventions/server-functions.md`.
      const db = await getDb();
      const result = await findSessionById(db, data.id).andThen((row) =>
        withProjectAccess(row.projectId, "view", ({ db: gatedDb, access }) => {
          if (row.userId !== access.user.id) {
            return errAsync(
              new CesareSessionNotFoundError(data.id) as
                | CesareSessionNotFoundError
                | DbError,
            );
          }
          return ResultAsync.fromPromise(
            gatedDb
              .update(cesareSessions)
              .set({ title: data.title })
              .where(eq(cesareSessions.id, data.id))
              .returning(),
            (e) =>
              new DbError("renameSession", e) as
                | CesareSessionNotFoundError
                | DbError,
          ).andThen((rows) => {
            const updated = rows[0];
            return updated
              ? okAsync(toWire(updated))
              : errAsync(
                  new DbError("renameSession:noReturn", null) as
                    | CesareSessionNotFoundError
                    | DbError,
                );
          });
        }),
      );
      return toShape(result);
    },
  );

// ─── Delete ──────────────────────────────────────────────────────────────────

export const deleteSession = createServerFn({ method: "POST" })
  .validator(DeleteSessionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string },
        ProjectAccessError | CesareSessionNotFoundError | DbError
      >
    > => {
      const db = await getDb();
      const result = await findSessionById(db, data.id).andThen((row) =>
        withProjectAccess(row.projectId, "view", ({ db: gatedDb, access }) => {
          if (row.userId !== access.user.id) {
            return errAsync(
              new CesareSessionNotFoundError(data.id) as
                | CesareSessionNotFoundError
                | DbError,
            );
          }
          return ResultAsync.fromPromise(
            gatedDb
              .delete(cesareSessions)
              .where(eq(cesareSessions.id, data.id)),
            (e) =>
              new DbError("deleteSession", e) as
                | CesareSessionNotFoundError
                | DbError,
          ).map(() => ({ id: data.id }));
        }),
      );
      return toShape(result);
    },
  );

// ─── Touch ──────────────────────────────────────────────────────────────────
// Server callers (cesare.server.ts) invoke this after each assistant turn so
// the rail's "lastAt" timestamp stays meaningful for session ordering.

export const touchSession = createServerFn({ method: "POST" })
  .validator(TouchSessionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        CesareSession,
        ProjectAccessError | CesareSessionNotFoundError | DbError
      >
    > => {
      const db = await getDb();
      const result = await findSessionById(db, data.id).andThen((row) =>
        withProjectAccess(row.projectId, "view", ({ db: gatedDb, access }) => {
          if (row.userId !== access.user.id) {
            return errAsync(
              new CesareSessionNotFoundError(data.id) as
                | CesareSessionNotFoundError
                | DbError,
            );
          }
          return ResultAsync.fromPromise(
            gatedDb
              .update(cesareSessions)
              .set({ lastMessageAt: new Date() })
              .where(eq(cesareSessions.id, data.id))
              .returning(),
            (e) =>
              new DbError("touchSession", e) as
                | CesareSessionNotFoundError
                | DbError,
          ).andThen((rows) => {
            const updated = rows[0];
            return updated
              ? okAsync(toWire(updated))
              : errAsync(
                  new DbError("touchSession:noReturn", null) as
                    | CesareSessionNotFoundError
                    | DbError,
                );
          });
        }),
      );
      return toShape(result);
    },
  );
