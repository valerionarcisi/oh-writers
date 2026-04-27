import { ResultAsync, ok, err } from "neverthrow";
import { eq } from "drizzle-orm";
import { projects } from "@oh-writers/db/schema";
import type { Project, TeamMember } from "@oh-writers/db/schema";
import type { TeamRole } from "@oh-writers/domain";
import { DbError, ForbiddenError } from "@oh-writers/utils";
import { ProjectNotFoundError } from "~/features/projects";
import { requireUser, type AppUser } from "~/server/context";
import { canEdit, getMembership } from "~/server/permissions";
import type { Db } from "~/server/db";

// Single deep-module entry point for the recurring server-fn prelude:
//   requireUser → load project → membership → canEdit / canRead.
// Replaces ~5 inline copies across features. Errors are returned as values
// (NotFound / Forbidden / Db); only an absent session still throws, matching
// the existing requireUser contract.

export type AccessLevel = "view" | "edit";

export interface ProjectAccess {
  readonly user: AppUser;
  readonly project: Project;
  readonly membership: TeamMember | null;
  readonly role: TeamRole | null;
  readonly isPersonalOwner: boolean;
}

export type ProjectAccessError =
  | ProjectNotFoundError
  | ForbiddenError
  | DbError;

const loadProject = (
  db: Db,
  projectId: string,
): ResultAsync<Project, ProjectNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("requireProjectAccess.loadProject", e),
  ).andThen((row) =>
    row ? ok(row) : err(new ProjectNotFoundError(projectId)),
  );

const loadMembership = (
  db: Db,
  project: Project,
  userId: string,
): ResultAsync<TeamMember | null, DbError> =>
  project.teamId
    ? getMembership(db, project.teamId, userId)
    : ResultAsync.fromSafePromise(Promise.resolve(null));

const checkAccess = (
  user: AppUser,
  project: Project,
  membership: TeamMember | null,
  level: AccessLevel,
): ResultAsync<ProjectAccess, ForbiddenError> => {
  const isPersonalOwner =
    project.teamId === null && project.ownerId === user.id;
  const role = (membership?.role as TeamRole | undefined) ?? null;
  const access: ProjectAccess = {
    user,
    project,
    membership,
    role,
    isPersonalOwner,
  };
  if (level === "view") {
    const canRead = isPersonalOwner || membership !== null;
    return canRead
      ? ResultAsync.fromSafePromise(Promise.resolve(access))
      : ResultAsync.fromPromise(
          Promise.reject(new ForbiddenError("read project")),
          (e) => e as ForbiddenError,
        );
  }
  if (!canEdit(project, user.id, membership)) {
    return ResultAsync.fromPromise(
      Promise.reject(new ForbiddenError("edit project")),
      (e) => e as ForbiddenError,
    );
  }
  return ResultAsync.fromSafePromise(Promise.resolve(access));
};

export const requireProjectAccess = (
  db: Db,
  projectId: string,
  level: AccessLevel,
): ResultAsync<ProjectAccess, ProjectAccessError> =>
  ResultAsync.fromPromise(requireUser(), (e) => e as never).andThen((user) =>
    loadProject(db, projectId).andThen((project) =>
      loadMembership(db, project, user.id).andThen((membership) =>
        checkAccess(user, project, membership, level),
      ),
    ),
  );
