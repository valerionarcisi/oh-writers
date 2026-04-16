import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { screenplays } from "@oh-writers/db/schema";
import type { Screenplay } from "@oh-writers/db";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { stripYjsState } from "~/server/helpers";
import { ensureFirstVersion } from "./versions.server";
import { GetScreenplayInput, SaveScreenplayInput } from "../screenplay.schema";
import {
  ScreenplayNotFoundError,
  ForbiddenError,
  DbError,
} from "../screenplay.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScreenplayView = Omit<Screenplay, "yjsState">;

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
      await requireUser();
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
              .set({
                content: data.content,
                pmDoc: data.pmDoc,
                pageCount,
                updatedAt: new Date(),
              })
              .where(eq(screenplays.id, data.screenplayId))
              .returning();

            if (!updated) throw new Error("Save returned no rows");

            // ensureFirstVersion runs inside the same transaction so the
            // count + insert are atomic — prevents duplicate "Versione 1"
            // rows from concurrent saves.
            await ensureFirstVersion(tx, updated.id, s.createdBy);

            return updated;
          }),
          (e) => new DbError("saveScreenplay", e),
        ).map(stripYjsState),
      );
    },
  );
