import { ResultAsync, err } from "neverthrow";
import { and, eq } from "drizzle-orm";
import {
  projects,
  scenes,
  screenplays,
  screenplayVersions,
  teamMembers,
} from "@oh-writers/db/schema";
import { DbError } from "@oh-writers/utils";
import type { TeamRole } from "@oh-writers/domain";
import type { Db } from "~/server/db";

export interface BreakdownAccess {
  projectId: string;
  projectTitle: string;
  projectSlug: string;
  isPersonalOwner: boolean;
  teamRole: TeamRole | null;
}

const buildAccess = async (
  db: Db,
  userId: string,
  project: {
    id: string;
    title: string;
    slug: string;
    ownerId: string | null;
    teamId: string | null;
  },
): Promise<BreakdownAccess> => {
  const isPersonalOwner = project.teamId === null && project.ownerId === userId;
  let teamRole: TeamRole | null = null;
  if (project.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, project.teamId),
        eq(teamMembers.userId, userId),
      ),
    });
    teamRole = (membership?.role as TeamRole | undefined) ?? null;
  }
  return {
    projectId: project.id,
    projectTitle: project.title,
    projectSlug: project.slug,
    isPersonalOwner,
    teamRole,
  };
};

export const resolveBreakdownAccessByProjectId = (
  db: Db,
  userId: string,
  projectId: string,
): ResultAsync<BreakdownAccess, DbError> =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveBreakdownAccessByProjectId/loadProject", e),
  ).andThen((project) =>
    project
      ? ResultAsync.fromPromise(
          buildAccess(db, userId, project),
          (e) => new DbError("resolveBreakdownAccessByProjectId/build", e),
        )
      : err(
          new DbError(
            "resolveBreakdownAccessByProjectId",
            `project not found: ${projectId}`,
          ),
        ),
  );

export const resolveBreakdownAccessByScreenplay = (
  db: Db,
  userId: string,
  screenplayId: string,
): ResultAsync<BreakdownAccess, DbError> =>
  ResultAsync.fromPromise(
    db.query.screenplays
      .findFirst({ where: eq(screenplays.id, screenplayId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveBreakdownAccessByScreenplay/loadScreenplay", e),
  ).andThen((screenplay) =>
    screenplay
      ? resolveBreakdownAccessByProjectId(db, userId, screenplay.projectId)
      : err(
          new DbError(
            "resolveBreakdownAccessByScreenplay",
            `screenplay not found: ${screenplayId}`,
          ),
        ),
  );

export const resolveBreakdownAccessByScene = (
  db: Db,
  userId: string,
  sceneId: string,
): ResultAsync<BreakdownAccess & { sceneScreenplayId: string }, DbError> =>
  ResultAsync.fromPromise(
    db.query.scenes
      .findFirst({ where: eq(scenes.id, sceneId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveBreakdownAccessByScene/loadScene", e),
  ).andThen((scene) =>
    scene
      ? resolveBreakdownAccessByScreenplay(db, userId, scene.screenplayId).map(
          (access) => ({ ...access, sceneScreenplayId: scene.screenplayId }),
        )
      : err(
          new DbError(
            "resolveBreakdownAccessByScene",
            `scene not found: ${sceneId}`,
          ),
        ),
  );

export const resolveBreakdownAccessByScreenplayVersion = (
  db: Db,
  userId: string,
  versionId: string,
): ResultAsync<BreakdownAccess, DbError> =>
  ResultAsync.fromPromise(
    db.query.screenplayVersions
      .findFirst({ where: eq(screenplayVersions.id, versionId) })
      .then((row) => row ?? null),
    (e) =>
      new DbError("resolveBreakdownAccessByScreenplayVersion/loadVersion", e),
  ).andThen((version) =>
    version
      ? resolveBreakdownAccessByScreenplay(db, userId, version.screenplayId)
      : err(
          new DbError(
            "resolveBreakdownAccessByScreenplayVersion",
            `version not found: ${versionId}`,
          ),
        ),
  );
