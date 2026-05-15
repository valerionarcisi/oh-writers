import { createServerFn } from "@tanstack/start";
import { ResultAsync } from "neverthrow";
import { eq, inArray, sql, and } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import {
  projects,
  documents,
  screenplays,
  scenes,
  characters,
  teamMembers,
  shootingDays,
  schedules,
  users,
} from "@oh-writers/db/schema";
import type { DocumentType, TeamRole } from "@oh-writers/domain";
import { TeamRoles } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { DbError } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import {
  computeProjectCompletion,
  pickCoverGradient,
  formatLastActivityLabel,
  type LastActivityKind,
} from "../dashboard.logic";
import type { DashboardProject } from "../dashboard.schema";

// ─── Internal aggregation row shape ────────────────────────────────────────────

type ScreenplayAgg = {
  projectId: string;
  pageCount: number;
  sceneCount: number;
  characterCount: number;
};

type DocFlagsRow = {
  projectId: string;
  type: DocumentType;
};

type CollaboratorRow = {
  teamId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: TeamRole;
};

type ScheduleAgg = {
  projectId: string;
  shootDays: number;
};

// ─── Pure assembly — testable, framework-free ──────────────────────────────────

type AssembleInput = {
  readonly userId: string;
  readonly nowIso: string;
  readonly projectRows: ReadonlyArray<typeof projects.$inferSelect>;
  readonly docs: ReadonlyArray<DocFlagsRow>;
  readonly screenplayByProject: ReadonlyMap<string, ScreenplayAgg>;
  readonly scheduleByProject: ReadonlyMap<string, ScheduleAgg>;
  readonly collaboratorsByTeam: ReadonlyMap<string, CollaboratorRow[]>;
};

const inferRole = (
  project: typeof projects.$inferSelect,
  userId: string,
  collaborators: ReadonlyArray<CollaboratorRow>,
): TeamRole => {
  if (project.ownerId === userId) return TeamRoles.OWNER;
  const me = collaborators.find((c) => c.userId === userId);
  return me?.role ?? TeamRoles.VIEWER;
};

const assembleDashboardProjects = ({
  userId,
  nowIso,
  projectRows,
  docs,
  screenplayByProject,
  scheduleByProject,
  collaboratorsByTeam,
}: AssembleInput): DashboardProject[] => {
  const filledByProject = new Map<string, DocumentType[]>();
  for (const row of docs) {
    const arr = filledByProject.get(row.projectId) ?? [];
    arr.push(row.type);
    filledByProject.set(row.projectId, arr);
  }

  return projectRows.map((project) => {
    const collaborators = project.teamId
      ? (collaboratorsByTeam.get(project.teamId) ?? [])
      : [];
    const screenplay = screenplayByProject.get(project.id);
    const filled = filledByProject.get(project.id) ?? [];
    const schedule = scheduleByProject.get(project.id);
    const role = inferRole(project, userId, collaborators);
    const isPersonal = project.teamId === null;

    const updatedAtIso = (project.updatedAt instanceof Date
      ? project.updatedAt
      : new Date(project.updatedAt as unknown as string)
    ).toISOString();

    const activityKind: LastActivityKind =
      (screenplay?.sceneCount ?? 0) > 0
        ? "screenplay_edit"
        : filled.length > 0
          ? "document_edit"
          : "project_created";

    return {
      id: project.id,
      title: project.title,
      format: project.format,
      genre: project.genre,
      role,
      isArchived: project.isArchived,
      isShared: !isPersonal,
      isPersonal,
      coverGradient: pickCoverGradient(project.id),
      stats: {
        sceneCount: screenplay?.sceneCount ?? 0,
        pageCount: screenplay?.pageCount ?? 0,
        totalCharacters: screenplay?.characterCount ?? 0,
        scheduledDays: schedule?.shootDays ?? 0,
        completionPercent: computeProjectCompletion({
          filledDocTypes: filled,
          hasScreenplay: (screenplay?.sceneCount ?? 0) > 0,
        }),
      },
      lastActivity: {
        atIso: updatedAtIso,
        kind: activityKind,
        label: formatLastActivityLabel({
          updatedAtIso,
          nowIso,
          editorName: null,
          kind: activityKind,
        }),
      },
      collaborators: collaborators.map((c) => ({
        id: c.userId,
        name: c.name,
        avatarUrl: c.avatarUrl,
      })),
      updatedAtIso,
    } satisfies DashboardProject;
  });
};

// ─── Data loaders ──────────────────────────────────────────────────────────────

const loadVisibleProjects = (db: Db, userId: string) =>
  ResultAsync.fromPromise(
    (async () => {
      const personalRows = await db
        .select()
        .from(projects)
        .where(eq(projects.ownerId, userId));

      const teamRows = await db
        .select({ project: projects })
        .from(projects)
        .innerJoin(teamMembers, eq(teamMembers.teamId, projects.teamId))
        .where(eq(teamMembers.userId, userId));

      const seen = new Set<string>();
      const out: (typeof projects.$inferSelect)[] = [];
      for (const row of personalRows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
      for (const { project } of teamRows) {
        if (seen.has(project.id)) continue;
        seen.add(project.id);
        out.push(project);
      }
      return out;
    })(),
    (e) => new DbError("getDashboardProjects.loadProjects", e),
  );

// Filled = content non-empty. Keep the predicate inside SQL to avoid pulling
// document bodies into memory.
const loadFilledDocsSql = (db: Db, projectIds: ReadonlyArray<string>) =>
  ResultAsync.fromPromise(
    projectIds.length === 0
      ? Promise.resolve([] as DocFlagsRow[])
      : db
          .select({
            projectId: documents.projectId,
            type: documents.type,
          })
          .from(documents)
          .where(
            and(
              inArray(documents.projectId, projectIds as string[]),
              sql`length(${documents.content}) > 0`,
            ),
          )
          .then((rows) =>
            rows.map((r) => ({
              projectId: r.projectId,
              type: r.type as DocumentType,
            })),
          ),
    (e) => new DbError("getDashboardProjects.loadDocs", e),
  );

const loadScreenplayAgg = (db: Db, projectIds: ReadonlyArray<string>) =>
  ResultAsync.fromPromise(
    (async () => {
      if (projectIds.length === 0) return new Map<string, ScreenplayAgg>();

      const screenplayRows = await db
        .select({
          id: screenplays.id,
          projectId: screenplays.projectId,
          pageCount: screenplays.pageCount,
        })
        .from(screenplays)
        .where(inArray(screenplays.projectId, projectIds as string[]));

      if (screenplayRows.length === 0)
        return new Map<string, ScreenplayAgg>();

      const screenplayIds = screenplayRows.map((s) => s.id);
      const sceneRows = await db
        .select({
          screenplayId: scenes.screenplayId,
          count: sql<number>`count(*)::int`,
        })
        .from(scenes)
        .where(inArray(scenes.screenplayId, screenplayIds))
        .groupBy(scenes.screenplayId);

      const characterRows = await db
        .select({
          screenplayId: characters.screenplayId,
          count: sql<number>`count(*)::int`,
        })
        .from(characters)
        .where(inArray(characters.screenplayId, screenplayIds))
        .groupBy(characters.screenplayId);

      const sceneByScreenplay = new Map(
        sceneRows.map((r) => [r.screenplayId, Number(r.count)]),
      );
      const charByScreenplay = new Map(
        characterRows.map((r) => [r.screenplayId, Number(r.count)]),
      );

      const map = new Map<string, ScreenplayAgg>();
      for (const s of screenplayRows) {
        map.set(s.projectId, {
          projectId: s.projectId,
          pageCount: s.pageCount,
          sceneCount: sceneByScreenplay.get(s.id) ?? 0,
          characterCount: charByScreenplay.get(s.id) ?? 0,
        });
      }
      return map;
    })(),
    (e) => new DbError("getDashboardProjects.loadScreenplayAgg", e),
  );

const loadScheduleAgg = (db: Db, projectIds: ReadonlyArray<string>) =>
  ResultAsync.fromPromise(
    (async () => {
      if (projectIds.length === 0) return new Map<string, ScheduleAgg>();

      const scheduleRows = await db
        .select({ id: schedules.id, projectId: schedules.projectId })
        .from(schedules)
        .where(inArray(schedules.projectId, projectIds as string[]));

      if (scheduleRows.length === 0) return new Map<string, ScheduleAgg>();

      const scheduleIds = scheduleRows.map((s) => s.id);
      const dayRows = await db
        .select({
          scheduleId: shootingDays.scheduleId,
          count: sql<number>`count(*)::int`,
        })
        .from(shootingDays)
        .where(inArray(shootingDays.scheduleId, scheduleIds))
        .groupBy(shootingDays.scheduleId);

      const byScheduleId = new Map(
        dayRows.map((r) => [r.scheduleId, Number(r.count)]),
      );
      const map = new Map<string, ScheduleAgg>();
      for (const s of scheduleRows) {
        map.set(s.projectId, {
          projectId: s.projectId,
          shootDays: byScheduleId.get(s.id) ?? 0,
        });
      }
      return map;
    })(),
    (e) => new DbError("getDashboardProjects.loadScheduleAgg", e),
  );

const loadCollaborators = (db: Db, teamIds: ReadonlyArray<string>) =>
  ResultAsync.fromPromise(
    (async () => {
      if (teamIds.length === 0)
        return new Map<string, CollaboratorRow[]>();
      const rows = await db
        .select({
          teamId: teamMembers.teamId,
          userId: teamMembers.userId,
          role: teamMembers.role,
          name: users.name,
          avatarUrl: users.avatarUrl,
        })
        .from(teamMembers)
        .innerJoin(users, eq(users.id, teamMembers.userId))
        .where(inArray(teamMembers.teamId, teamIds as string[]));

      const map = new Map<string, CollaboratorRow[]>();
      for (const r of rows) {
        const list = map.get(r.teamId) ?? [];
        list.push({
          teamId: r.teamId,
          userId: r.userId,
          name: r.name,
          avatarUrl: r.avatarUrl,
          role: r.role as TeamRole,
        });
        map.set(r.teamId, list);
      }
      return map;
    })(),
    (e) => new DbError("getDashboardProjects.loadCollaborators", e),
  );

// ─── Public server fn ──────────────────────────────────────────────────────────

export const getDashboardProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResultShape<DashboardProject[], DbError>> => {
    const user = await requireUser();
    const db = await getDb();

    return toShape(
      await loadVisibleProjects(db, user.id).andThen((projectRows) => {
        const projectIds = projectRows.map((p) => p.id);
        const teamIds = [
          ...new Set(
            projectRows
              .map((p) => p.teamId)
              .filter((id): id is string => id !== null),
          ),
        ];

        return ResultAsync.combine([
          loadFilledDocsSql(db, projectIds),
          loadScreenplayAgg(db, projectIds),
          loadScheduleAgg(db, projectIds),
          loadCollaborators(db, teamIds),
        ]).map(
          ([docs, screenplayByProject, scheduleByProject, collaboratorsByTeam]) =>
            assembleDashboardProjects({
              userId: user.id,
              nowIso: new Date().toISOString(),
              projectRows,
              docs,
              screenplayByProject,
              scheduleByProject,
              collaboratorsByTeam,
            }),
        );
      }),
    );
  },
);

export const dashboardProjectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects", "dashboard"] as const,
    queryFn: () => getDashboardProjects(),
  });

// Exported for unit tests — pure assembly without touching the DB.
export const __test__ = { assembleDashboardProjects };
