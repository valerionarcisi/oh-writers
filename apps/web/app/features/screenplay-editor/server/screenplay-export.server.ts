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
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { getMembership } from "~/server/permissions";
import {
  ScreenplayNotFoundError,
  ProjectNotFoundError,
  ForbiddenError,
  DbError,
} from "../screenplay.errors";

export const ExportScreenplayPdfInput = z.object({
  screenplayId: z.string().uuid(),
  includeCoverPage: z.boolean().default(false),
});

export const exportScreenplayPdf = createServerFn({ method: "POST" })
  .validator(ExportScreenplayPdfInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        | ScreenplayNotFoundError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
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
        return toShape(err(new ProjectNotFoundError(screenplay.projectId)));

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

      const finalFountain = data.includeCoverPage
        ? prependTitlePageToFountain(fountain, {
            title: project.title,
            author: project.titlePageAuthor,
            draftDate: project.titlePageDraftDate,
          })
        : fountain;

      const buffer = await buildScreenplayPdf(finalFountain);

      return toShape(
        ok({
          pdfBase64: buffer.toString("base64"),
          filename: buildScreenplayFilename(project.title, screenplay.title),
        }),
      );
    },
  );
