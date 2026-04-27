import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import type { Screenplay } from "@oh-writers/db";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { getDb } from "~/server/db";
import { stripYjsState } from "~/server/helpers";
import { ensureFirstVersion } from "./versions.server";
import { canEdit, isOwner } from "~/server/permissions";
import { requireProjectAccess } from "~/server/access";
import { GetScreenplayInput, SaveScreenplayInput } from "../screenplay.schema";
import {
  ScreenplayNotFoundError,
  ForbiddenError,
  DbError,
} from "../screenplay.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScreenplayView = Omit<Screenplay, "yjsState"> & {
  // Optional because only the GET endpoint computes permissions; mutation
  // responses (save, switch version, …) return the raw row without it.
  canEdit?: boolean;
  isOwner?: boolean;
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
      const db = await getDb();

      const accessResult = await requireProjectAccess(
        db,
        data.projectId,
        "view",
      );
      if (accessResult.isErr()) {
        const e = accessResult.error;
        if (e._tag === "ProjectNotFoundError")
          return toShape(err(new ScreenplayNotFoundError(data.projectId)));
        if (e._tag === "ForbiddenError")
          return toShape(err(new ScreenplayNotFoundError(data.projectId)));
        return toShape(err(e));
      }
      const { user, project, membership } = accessResult.value;

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

      const canUserEdit = canEdit(project, user.id, membership);
      const isUserOwner = isOwner(project, user.id, membership);

      // Spec 06b: live content sits on the active version row. Fall back to
      // screenplays.content for legacy rows with no current_version_id.
      let liveContent = result.value.content;
      let livePageCount = result.value.pageCount;
      if (result.value.currentVersionId) {
        const versionResult = await ResultAsync.fromPromise(
          db.query.screenplayVersions
            .findFirst({
              where: eq(screenplayVersions.id, result.value.currentVersionId),
            })
            .then((row) => row ?? null),
          (e) => new DbError("getScreenplay.version", e),
        );
        if (versionResult.isErr()) return toShape(err(versionResult.error));
        if (versionResult.value) {
          liveContent = versionResult.value.content;
          livePageCount = versionResult.value.pageCount;
        }
      }

      return toShape(
        ok({
          ...stripYjsState(result.value),
          content: liveContent,
          pageCount: livePageCount,
          canEdit: canUserEdit,
          isOwner: isUserOwner,
        }),
      );
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

      const accessResult = await requireProjectAccess(db, s.projectId, "edit");
      if (accessResult.isErr()) {
        const e = accessResult.error;
        if (e._tag === "ProjectNotFoundError")
          return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));
        return toShape(err(e));
      }

      // Spec 06b: the active version row is the source of truth. Auto-version
      // snapshots are gone — saving just writes to the current version.
      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            if (s.currentVersionId) {
              await tx
                .update(screenplayVersions)
                .set({ content: data.content, pageCount })
                .where(eq(screenplayVersions.id, s.currentVersionId));
            }
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
