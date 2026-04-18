import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { projects } from "@oh-writers/db/schema";
import type { TeamMember } from "@oh-writers/db/schema";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { isOwner, getMembership } from "~/server/permissions";
import {
  UpdateTitlePageInput,
  EMPTY_TITLE_PAGE,
  type TitlePage,
  type DraftColor,
} from "../title-page.schema";
import {
  ProjectNotFoundError,
  ForbiddenError,
  DbError,
} from "../projects.errors";

export type TitlePageView = {
  projectTitle: string;
  titlePage: TitlePage;
  canEdit: boolean;
};

const toTitlePage = (row: typeof projects.$inferSelect): TitlePage => ({
  author: row.titlePageAuthor,
  basedOn: row.titlePageBasedOn,
  contact: row.titlePageContact,
  draftDate: row.titlePageDraftDate,
  draftColor: row.titlePageDraftColor as DraftColor | null,
  wgaRegistration: row.titlePageWgaRegistration,
  notes: row.titlePageNotes,
});

export const getTitlePage = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<TitlePageView, ProjectNotFoundError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("getTitlePage", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));

      const project = projectResult.value;
      if (!project)
        return toShape(err(new ProjectNotFoundError(data.projectId)));

      let membership: TeamMember | null = null;
      if (project.teamId) {
        const memberResult = await getMembership(db, project.teamId, user.id);
        if (memberResult.isErr()) return toShape(err(memberResult.error));
        membership = memberResult.value;
      }

      return toShape(
        ok({
          projectTitle: project.title,
          titlePage: toTitlePage(project),
          canEdit: isOwner(project, user.id, membership),
        }),
      );
    },
  );

export const titlePageQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "title-page"] as const,
    queryFn: () => getTitlePage({ data: { projectId } }),
  });

export const updateTitlePage = createServerFn({ method: "POST" })
  .validator(UpdateTitlePageInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<TitlePage, ProjectNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("updateTitlePage", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));

      const project = projectResult.value;
      if (!project)
        return toShape(err(new ProjectNotFoundError(data.projectId)));

      let membership: TeamMember | null = null;
      if (project.teamId) {
        const memberResult = await getMembership(db, project.teamId, user.id);
        if (memberResult.isErr()) return toShape(err(memberResult.error));
        membership = memberResult.value;
      }

      if (!isOwner(project, user.id, membership)) {
        return toShape(err(new ForbiddenError("update title page")));
      }

      const tp = data.titlePage;

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(projects)
            .set({
              titlePageAuthor: tp.author,
              titlePageBasedOn: tp.basedOn,
              titlePageContact: tp.contact,
              titlePageDraftDate: tp.draftDate,
              titlePageDraftColor: tp.draftColor,
              titlePageWgaRegistration: tp.wgaRegistration,
              titlePageNotes: tp.notes,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, data.projectId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("updateTitlePage", e),
        ).andThen((updated) =>
          updated
            ? ok(toTitlePage(updated))
            : err(new ProjectNotFoundError(data.projectId)),
        ),
      );
    },
  );

export { EMPTY_TITLE_PAGE };
