import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import type { Result } from "neverthrow";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import type { Screenplay } from "@oh-writers/db";
import { getUser } from "~/server/context";
import { GetScreenplayInput, SaveScreenplayInput } from "../screenplay.schema";
import {
  ScreenplayNotFoundError,
  ForbiddenError,
  DbError,
} from "../screenplay.errors";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_AUTO_SNAPSHOTS = 50;

// ─── Serializable result shape ────────────────────────────────────────────────
// createServerFn requires JSON-serializable return types. Neverthrow's Result
// has methods (isOk(), map(), etc.) which fail that check. We convert at the
// server function boundary to a plain discriminated union that survives JSON.

export type OkShape<T> = { readonly isOk: true; readonly value: T };
export type ErrShape<E> = { readonly isOk: false; readonly error: E };
export type ResultShape<T, E> = OkShape<T> | ErrShape<E>;

const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> =>
  result.isOk()
    ? { isOk: true as const, value: result.value }
    : { isOk: false as const, error: result.error };

// ─── Types ────────────────────────────────────────────────────────────────────

// yjsState is a binary Buffer (bytea column) — strip it before sending to client.
export type ScreenplayView = Omit<Screenplay, "yjsState">;

const stripYjsState = <T extends { yjsState?: unknown }>({
  yjsState: _,
  ...rest
}: T): Omit<T, "yjsState"> => rest as Omit<T, "yjsState">;

// ─── Auth helper ──────────────────────────────────────────────────────────────

const requireUser = async () => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};

// ─── DB helper ────────────────────────────────────────────────────────────────

const getDb = async () => {
  const { db } = await import("@oh-writers/db");
  return db;
};

const estimatePageCount = (content: string): number =>
  Math.max(0, Math.ceil(content.split("\n").length / 55));

// ─── Get screenplay ───────────────────────────────────────────────────────────

export const getScreenplay = createServerFn({ method: "GET" })
  .validator(GetScreenplayInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<ScreenplayView, ScreenplayNotFoundError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.projectId, data.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("getScreenplay", e),
      );

      if (result.isErr()) return toShape(err(result.error));
      if (!result.value) {
        return toShape(err(new ScreenplayNotFoundError(data.projectId)));
      }

      return toShape(ok(stripYjsState(result.value)));
    },
  );

export const screenplayQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["screenplays", projectId] as const,
    queryFn: () => getScreenplay({ data: { projectId } }),
  });

// ─── Save screenplay ──────────────────────────────────────────────────────────

export const saveScreenplay = createServerFn({ method: "POST" })
  .validator(SaveScreenplayInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        ScreenplayView,
        ScreenplayNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const pageCount = estimatePageCount(data.content);
      const db = await getDb();

      const screenplayResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, data.screenplayId) })
          .then((row) => row ?? null),
        (e) => new DbError("saveScreenplay.find", e),
      );
      if (screenplayResult.isErr()) return toShape(err(screenplayResult.error));
      const s = screenplayResult.value;
      if (!s)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      const { projects: projectsTable } = await import("@oh-writers/db/schema");
      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projectsTable.id, s.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("saveScreenplay.project", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const project = projectResult.value;
      if (!project)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));
      if (project.isArchived) {
        return toShape(
          err(new ForbiddenError("save screenplay: project is archived")),
        );
      }

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [updated] = await tx
              .update(screenplays)
              .set({ content: data.content, pageCount, updatedAt: new Date() })
              .where(eq(screenplays.id, data.screenplayId))
              .returning();

            if (!updated) throw new Error("Save returned no rows");

            // Auto-version: snapshot every 5 min if content changed
            if (s.content !== data.content) {
              const {
                and,
                desc,
                asc,
                count: countFn,
              } = await import("drizzle-orm");

              const latest = await tx.query.screenplayVersions.findFirst({
                where: and(
                  eq(screenplayVersions.screenplayId, data.screenplayId),
                  eq(screenplayVersions.isAuto, true),
                ),
                orderBy: [desc(screenplayVersions.createdAt)],
              });

              const needsSnapshot =
                !latest ||
                Date.now() - latest.createdAt.getTime() >= FIVE_MINUTES_MS;

              if (needsSnapshot) {
                const [autoCountRow] = await tx
                  .select({ value: countFn() })
                  .from(screenplayVersions)
                  .where(
                    and(
                      eq(screenplayVersions.screenplayId, data.screenplayId),
                      eq(screenplayVersions.isAuto, true),
                    ),
                  );
                const autoCount = autoCountRow?.value ?? 0;

                if (autoCount >= MAX_AUTO_SNAPSHOTS) {
                  const oldest = await tx.query.screenplayVersions.findFirst({
                    where: and(
                      eq(screenplayVersions.screenplayId, data.screenplayId),
                      eq(screenplayVersions.isAuto, true),
                    ),
                    orderBy: [asc(screenplayVersions.createdAt)],
                  });
                  if (oldest) {
                    await tx
                      .delete(screenplayVersions)
                      .where(eq(screenplayVersions.id, oldest.id));
                  }
                }

                await tx.insert(screenplayVersions).values({
                  screenplayId: data.screenplayId,
                  label: null,
                  content: s.content,
                  pageCount: s.pageCount,
                  isAuto: true,
                  createdBy: user.id,
                });
              }
            }

            return updated;
          }),
          (e) => new DbError("saveScreenplay", e),
        ).andThen((updated) => ok(stripYjsState(updated))),
      );
    },
  );
