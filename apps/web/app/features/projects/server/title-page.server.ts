import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { projects } from "@oh-writers/db/schema";
import type { TeamMember } from "@oh-writers/db/schema";
import type { DraftRevisionColor } from "@oh-writers/domain";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { isOwner, getMembership } from "~/server/permissions";
import { loadProjectDraftMeta } from "./draft-meta.server";
import {
  UpdateTitlePageInput,
  EMPTY_TITLE_PAGE,
  type TitlePage,
  type DraftColor,
} from "../title-page.schema";
import {
  UpdateTitlePageStateInput,
  EMPTY_TITLE_PAGE_STATE,
  type TitlePageState,
} from "../title-page-state.schema";
import { extractTitle } from "../title-page-pm/title-extract";
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

// ─── New state-based API (spec 07b: PM doc + draft date + color) ──────────────
// Spec 06e: draftDate / draftColor are now derived from the screenplay's
// current version. The title page is read-only for those two fields.

export type TitlePageStateView = {
  projectTitle: string;
  state: TitlePageState;
  canEdit: boolean;
  isOwner: boolean;
};

const loadCurrentVersionMeta = (
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
): Promise<{ draftDate: string | null; draftColor: DraftColor | null }> =>
  loadProjectDraftMeta(db, projectId) as Promise<{
    draftDate: string | null;
    draftColor: DraftColor | null;
  }>;

const buildTitlePageState = (
  row: typeof projects.$inferSelect,
  meta: { draftDate: string | null; draftColor: DraftColor | null },
): TitlePageState => ({
  doc: row.titlePageDoc ?? null,
  draftDate: meta.draftDate,
  draftColor: meta.draftColor,
});

export const getTitlePageState = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<TitlePageStateView, ProjectNotFoundError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("getTitlePageState", e),
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

      const owner = isOwner(project, user.id, membership);
      const meta = await loadCurrentVersionMeta(db, data.projectId);

      return toShape(
        ok({
          projectTitle: project.title,
          state: buildTitlePageState(project, meta),
          canEdit: owner,
          isOwner: owner,
        }),
      );
    },
  );

export const titlePageStateQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "title-page-state"] as const,
    queryFn: () => getTitlePageState({ data: { projectId } }),
  });

export const updateTitlePageState = createServerFn({ method: "POST" })
  .validator(UpdateTitlePageStateInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        TitlePageState,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("updateTitlePageState", e),
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

      const { state } = data;
      const nextTitle = extractTitle(state.doc).trim();

      // Spec 06e: draftDate / draftColor live on the screenplay version now.
      // The PM editor on the title page only persists the doc + the project
      // title; any draft meta in the input is ignored.
      const updateResult = await ResultAsync.fromPromise(
        db
          .update(projects)
          .set({
            titlePageDoc: state.doc as Record<
              string,
              NonNullable<unknown>
            > | null,
            ...(nextTitle.length > 0 ? { title: nextTitle } : {}),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, data.projectId))
          .returning()
          .then((rows) => rows[0] ?? null),
        (e) => new DbError("updateTitlePageState", e),
      );
      if (updateResult.isErr()) return toShape(err(updateResult.error));
      const updated = updateResult.value;
      if (!updated)
        return toShape(err(new ProjectNotFoundError(data.projectId)));

      const meta = await loadCurrentVersionMeta(db, data.projectId);
      return toShape(ok(buildTitlePageState(updated, meta)));
    },
  );

export { EMPTY_TITLE_PAGE_STATE };
