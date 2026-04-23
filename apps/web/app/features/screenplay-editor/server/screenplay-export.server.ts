import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  screenplays,
  screenplayVersions,
  projects,
} from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import {
  EXPORT_FORMAT_META,
  ExportFormatSchema,
  listScenesInFountain,
  type FountainScene,
} from "@oh-writers/domain";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { getMembership } from "~/server/permissions";
import {
  ScreenplayNotFoundError,
  ForbiddenError,
  DbError,
} from "../screenplay.errors";

/**
 * Spec 05k input shape. `format` defaults to `"standard"` so existing
 * callers (Spec 05j tests) keep working without changes. `sceneNumbers`
 * is required only when `format === "sides"` — enforced via `superRefine`
 * so we get a single typed validation error instead of a runtime check
 * inside the handler.
 */
export const ExportScreenplayPdfInput = z
  .object({
    screenplayId: z.string().uuid(),
    includeCoverPage: z.boolean().default(false),
    format: ExportFormatSchema.default("standard"),
    sceneNumbers: z.array(z.string().min(1)).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.format === "sides") {
      const list = value.sceneNumbers ?? [];
      if (list.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sceneNumbers"],
          message:
            "format 'sides' requires at least one scene number to be selected",
        });
      }
    }
  });

export const exportScreenplayPdf = createServerFn({ method: "POST" })
  .validator(ExportScreenplayPdfInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string; format: string },
        ScreenplayNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const screenplayResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, data.screenplayId) })
          .then((row) => row ?? null),
        (e) => new DbError("exportScreenplayPdf.screenplay", e),
      );
      if (screenplayResult.isErr()) return toShape(err(screenplayResult.error));
      const screenplay = screenplayResult.value;
      if (!screenplay)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projects.id, screenplay.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("exportScreenplayPdf.project", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const project = projectResult.value;
      if (!project)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      // Read access mirrors getDocument / exportNarrativePdf — personal
      // owners and any team member (viewer included).
      const membershipResult = project.teamId
        ? await getMembership(db, project.teamId, user.id)
        : ok(null);
      if (membershipResult.isErr()) return toShape(err(membershipResult.error));
      const isPersonalOwner =
        project.teamId === null && project.ownerId === user.id;
      const canRead = isPersonalOwner || membershipResult.value !== null;
      if (!canRead) {
        return toShape(
          err(new ForbiddenError("export screenplay: not a project member")),
        );
      }

      // Resolve the active version's content (Spec 06b parity); fall back to
      // the screenplay row's mirrored text if no current version pointer.
      let fountain = screenplay.content;
      if (screenplay.currentVersionId) {
        const versionResult = await ResultAsync.fromPromise(
          db.query.screenplayVersions
            .findFirst({
              where: eq(screenplayVersions.id, screenplay.currentVersionId),
            })
            .then((row) => row ?? null),
          (e) => new DbError("exportScreenplayPdf.version", e),
        );
        if (versionResult.isErr()) return toShape(err(versionResult.error));
        if (versionResult.value) fountain = versionResult.value.content;
      }

      const { buildScreenplayPdf, buildScreenplayFilename } =
        await import("../lib/pdf-screenplay");
      const { prependTitlePageToFountain } =
        await import("../lib/title-page-prepend");
      const { buildExportPipeline } = await import("../lib/export-pipeline");

      // Cover page is prepended BEFORE the format pipeline so Sides can
      // strip it back out (sides shouldn't carry a cover page even if the
      // user toggles it on by mistake).
      const fountainWithCover = data.includeCoverPage
        ? prependTitlePageToFountain(fountain, {
            title: project.title,
            author: project.titlePageAuthor,
            draftDate: project.titlePageDraftDate,
          })
        : fountain;

      const pipelineResult = buildExportPipeline(data.format, {
        fountain: fountainWithCover,
        sceneSelection: data.sceneNumbers,
      });

      const buffer = await buildScreenplayPdf(pipelineResult.fountain, {
        invocation: pipelineResult.invocation,
      });

      const meta = EXPORT_FORMAT_META[data.format];
      return toShape(
        ok({
          pdfBase64: buffer.toString("base64"),
          filename: buildScreenplayFilename(
            project.title,
            screenplay.title,
            meta.filenameSlug,
          ),
          format: data.format,
        }),
      );
    },
  );

/**
 * Lists the scene headings of a screenplay for the Sides export modal's
 * multi-select. Cheap: parses the active version's fountain in-memory,
 * no DB scenes-table read (the screenplay editor doesn't keep a 1:1
 * scene table; numbering is intrinsic to the fountain).
 */
export const ListScreenplayScenesInput = z.object({
  screenplayId: z.string().uuid(),
});

export const listScreenplayScenes = createServerFn({ method: "GET" })
  .validator(ListScreenplayScenesInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { scenes: FountainScene[] },
        ScreenplayNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const screenplayResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, data.screenplayId) })
          .then((row) => row ?? null),
        (e) => new DbError("listScreenplayScenes.screenplay", e),
      );
      if (screenplayResult.isErr()) return toShape(err(screenplayResult.error));
      const screenplay = screenplayResult.value;
      if (!screenplay)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projects.id, screenplay.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("listScreenplayScenes.project", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const project = projectResult.value;
      if (!project)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      const membershipResult = project.teamId
        ? await getMembership(db, project.teamId, user.id)
        : ok(null);
      if (membershipResult.isErr()) return toShape(err(membershipResult.error));
      const isPersonalOwner =
        project.teamId === null && project.ownerId === user.id;
      const canRead = isPersonalOwner || membershipResult.value !== null;
      if (!canRead) {
        return toShape(
          err(
            new ForbiddenError("list screenplay scenes: not a project member"),
          ),
        );
      }

      let fountain = screenplay.content;
      if (screenplay.currentVersionId) {
        const versionResult = await ResultAsync.fromPromise(
          db.query.screenplayVersions
            .findFirst({
              where: eq(screenplayVersions.id, screenplay.currentVersionId),
            })
            .then((row) => row ?? null),
          (e) => new DbError("listScreenplayScenes.version", e),
        );
        if (versionResult.isErr()) return toShape(err(versionResult.error));
        if (versionResult.value) fountain = versionResult.value.content;
      }

      return toShape(ok({ scenes: listScenesInFountain(fountain) }));
    },
  );
