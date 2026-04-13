import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, and, isNull } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { DocumentTypes, TeamRoles } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import {
  projects,
  documents,
  screenplays,
  teamMembers,
} from "@oh-writers/db/schema";
import type { TeamMember } from "@oh-writers/db/schema";
import type { Project, Document, Screenplay } from "@oh-writers/db";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { stripYjsState } from "~/server/helpers";
import { CreateProjectInput, UpdateProjectInput } from "../projects.schema";
import {
  ProjectNotFoundError,
  ForbiddenError,
  DbError,
} from "../projects.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentView = Omit<Document, "yjsState">;
export type ScreenplayView = Omit<Screenplay, "yjsState">;

export type ProjectWithDocuments = Project & {
  documents: DocumentView[];
  screenplay: ScreenplayView | null;
};

// ─── Permission helpers ───────────────────────────────────────────────────────

const canEdit = (
  project: {
    ownerId: string | null;
    teamId: string | null;
    isArchived: boolean;
  },
  userId: string,
  membership: TeamMember | null,
): boolean => {
  if (project.isArchived) return false;
  if (project.ownerId === userId && project.teamId === null) return true;
  if (!membership) return false;
  return (
    membership.role === TeamRoles.OWNER || membership.role === TeamRoles.EDITOR
  );
};

const isOwner = (
  project: { ownerId: string | null; teamId: string | null },
  userId: string,
  membership: TeamMember | null,
): boolean => {
  if (project.ownerId === userId && project.teamId === null) return true;
  return membership?.role === TeamRoles.OWNER;
};

// ─── DB helpers ───────────────────────────────────────────────────────────────

const getMembership = (
  db: Db,
  teamId: string,
  userId: string,
): ResultAsync<TeamMember | null, DbError> =>
  ResultAsync.fromPromise(
    db.query.teamMembers
      .findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
        ),
      })
      .then((row) => row ?? null),
    (e) => new DbError("getMembership", e),
  );

const toSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200) || "untitled";

// ─── List personal projects ───────────────────────────────────────────────────

export const listPersonalProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<Project[]> => {
    const user = await requireUser();
    const db = await getDb();
    return ResultAsync.fromPromise(
      db
        .select()
        .from(projects)
        .where(and(eq(projects.ownerId, user.id), isNull(projects.teamId))),
      (e) => new DbError("listPersonalProjects", e),
    ).match(
      (rows) => rows,
      (error) => {
        throw error;
      },
    );
  },
);

export const personalProjectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects", "personal"] as const,
    queryFn: () => listPersonalProjects(),
  });

// ─── List team projects ───────────────────────────────────────────────────────

export const listTeamProjects = createServerFn({ method: "GET" })
  .validator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data }): Promise<Project[]> => {
    await requireUser();
    const db = await getDb();
    return ResultAsync.fromPromise(
      db.select().from(projects).where(eq(projects.teamId, data.teamId)),
      (e) => new DbError("listTeamProjects", e),
    ).match(
      (rows) => rows,
      (error) => {
        throw error;
      },
    );
  });

export const teamProjectsQueryOptions = (teamId: string) =>
  queryOptions({
    queryKey: ["projects", "team", teamId] as const,
    queryFn: () => listTeamProjects({ data: { teamId } }),
  });

// ─── Get project by ID ────────────────────────────────────────────────────────

export const getProjectById = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<ProjectWithDocuments, ProjectNotFoundError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("getProjectById", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));

      const project = projectResult.value;
      if (!project)
        return toShape(err(new ProjectNotFoundError(data.projectId)));

      const relatedResult = await ResultAsync.fromPromise(
        Promise.all([
          db
            .select()
            .from(documents)
            .where(eq(documents.projectId, data.projectId)),
          db.query.screenplays
            .findFirst({ where: eq(screenplays.projectId, data.projectId) })
            .then((row) => row ?? null),
        ]),
        (e) => new DbError("getProjectById.related", e),
      );

      return toShape(
        relatedResult.map(([projectDocuments, screenplay]) => ({
          ...project,
          documents: projectDocuments.map(stripYjsState),
          screenplay: screenplay ? stripYjsState(screenplay) : null,
        })),
      );
    },
  );

export const projectQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId] as const,
    queryFn: () => getProjectById({ data: { projectId } }),
  });

// ─── Create project ───────────────────────────────────────────────────────────

export const createProject = createServerFn({ method: "POST" })
  .validator(CreateProjectInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<Project, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      if (data.teamId) {
        const memberResult = await getMembership(db, data.teamId, user.id);
        if (memberResult.isErr()) return toShape(err(memberResult.error));
        const membership = memberResult.value;
        if (!membership)
          return toShape(
            err(new ForbiddenError("create project: not a team member")),
          );
        const canCreate =
          membership.role === TeamRoles.OWNER ||
          membership.role === TeamRoles.EDITOR;
        if (!canCreate)
          return toShape(
            err(new ForbiddenError("create project: viewer cannot create")),
          );
      }

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [project] = await tx
              .insert(projects)
              .values({
                title: data.title,
                slug: toSlug(data.title),
                format: data.format as (typeof projects.$inferInsert)["format"],
                genre: (data.genre ??
                  null) as (typeof projects.$inferInsert)["genre"],
                ownerId: data.teamId ? null : user.id,
                teamId: data.teamId ?? null,
              })
              .returning();

            if (!project) throw new Error("Insert returned no rows");

            await tx.insert(documents).values(
              Object.values(DocumentTypes).map((type) => ({
                projectId: project.id,
                type,
                title: type.charAt(0).toUpperCase() + type.slice(1),
                content: "",
                createdBy: user.id,
              })),
            );

            await tx.insert(screenplays).values({
              projectId: project.id,
              title: data.title,
              content: "",
              createdBy: user.id,
            });

            return project;
          }),
          (e) => new DbError("createProject", e),
        ),
      );
    },
  );

// ─── Update project ───────────────────────────────────────────────────────────

export const updateProject = createServerFn({ method: "POST" })
  .validator(UpdateProjectInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<Project, ProjectNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("updateProject", e),
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

      if (!canEdit(project, user.id, membership)) {
        return toShape(err(new ForbiddenError("update project")));
      }

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(projects)
            .set({ ...data.data, updatedAt: new Date() })
            .where(eq(projects.id, data.projectId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("updateProject", e),
        ).andThen((updated) =>
          updated ? ok(updated) : err(new ProjectNotFoundError(data.projectId)),
        ),
      );
    },
  );

// ─── Archive project ──────────────────────────────────────────────────────────

export const archiveProject = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<Project, ProjectNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("archiveProject", e),
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

      if (!canEdit({ ...project, isArchived: false }, user.id, membership)) {
        return toShape(err(new ForbiddenError("archive project")));
      }

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(projects)
            .set({ isArchived: true, updatedAt: new Date() })
            .where(eq(projects.id, data.projectId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("archiveProject", e),
        ).andThen((updated) =>
          updated ? ok(updated) : err(new ProjectNotFoundError(data.projectId)),
        ),
      );
    },
  );

// ─── Restore project ──────────────────────────────────────────────────────────

export const restoreProject = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<Project, ProjectNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("restoreProject", e),
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

      if (!canEdit({ ...project, isArchived: false }, user.id, membership)) {
        return toShape(err(new ForbiddenError("restore project")));
      }

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(projects)
            .set({ isArchived: false, updatedAt: new Date() })
            .where(eq(projects.id, data.projectId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("restoreProject", e),
        ).andThen((updated) =>
          updated ? ok(updated) : err(new ProjectNotFoundError(data.projectId)),
        ),
      );
    },
  );

// ─── Delete project ───────────────────────────────────────────────────────────

export const deleteProject = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, ProjectNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects.findFirst({ where: eq(projects.id, data.projectId) }),
        (e) => new DbError("deleteProject", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));

      const project = projectResult.value;
      if (!project)
        return toShape(err(new ProjectNotFoundError(data.projectId)));
      if (!project.isArchived) {
        return toShape(
          err(new ForbiddenError("delete project: must archive first")),
        );
      }

      let membership: TeamMember | null = null;
      if (project.teamId) {
        const memberResult = await getMembership(db, project.teamId, user.id);
        if (memberResult.isErr()) return toShape(err(memberResult.error));
        membership = memberResult.value;
      }

      if (!isOwner(project, user.id, membership)) {
        return toShape(err(new ForbiddenError("delete project: not owner")));
      }

      return toShape(
        await ResultAsync.fromPromise(
          db
            .delete(projects)
            .where(eq(projects.id, data.projectId))
            .then(() => undefined),
          (e) => new DbError("deleteProject", e),
        ),
      );
    },
  );
