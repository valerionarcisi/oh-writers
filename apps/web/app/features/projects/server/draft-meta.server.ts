import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import type { DraftRevisionColor } from "@oh-writers/domain";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { DbError } from "../projects.errors";

export type ProjectDraftMeta = {
  draftDate: string | null;
  draftColor: DraftRevisionColor | null;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * Resolve `(draftDate, draftColor)` for a project from its screenplay's
 * current version. If the version has no color set (legacy projects from
 * before spec 06e), lazily backfill `white + today` so every project
 * always reflects the Hollywood revision cycle.
 */
export const loadProjectDraftMeta = async (
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
): Promise<ProjectDraftMeta> => {
  const row = await db
    .select({
      versionId: screenplayVersions.id,
      draftDate: screenplayVersions.draftDate,
      draftColor: screenplayVersions.draftColor,
    })
    .from(screenplays)
    .innerJoin(
      screenplayVersions,
      eq(screenplayVersions.id, screenplays.currentVersionId),
    )
    .where(eq(screenplays.projectId, projectId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) return { draftDate: null, draftColor: null };

  if (row.draftColor === null) {
    const today = todayIso();
    await db
      .update(screenplayVersions)
      .set({ draftColor: "white", draftDate: today })
      .where(eq(screenplayVersions.id, row.versionId));
    return { draftDate: today, draftColor: "white" };
  }

  return {
    draftDate: row.draftDate ?? null,
    draftColor: row.draftColor as DraftRevisionColor,
  };
};

export const getProjectDraftMeta = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<ProjectDraftMeta, DbError>> => {
      await requireUser();
      const db = await getDb();
      return toShape(
        await ResultAsync.fromPromise(
          loadProjectDraftMeta(db, data.projectId),
          (e) => new DbError("getProjectDraftMeta", e),
        ).andThen((meta) => ok(meta)),
      );
    },
  );

export const projectDraftMetaQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "draft-meta"] as const,
    queryFn: () => getProjectDraftMeta({ data: { projectId } }),
  });

// Re-export for symmetry; callers may use `err` rarely here.
export { err };
