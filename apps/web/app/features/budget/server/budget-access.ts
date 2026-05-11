import { ResultAsync, err } from "neverthrow";
import { eq } from "drizzle-orm";
import { projects, teamMembers } from "@oh-writers/db/schema";
import { DbError } from "@oh-writers/utils";
import type { TeamRole } from "@oh-writers/domain";
import type { Db } from "~/server/db";

export interface BudgetAccess {
  projectId: string;
  isPersonalOwner: boolean;
  teamRole: TeamRole | null;
}

export const resolveBudgetAccessByProjectId = (
  db: Db,
  userId: string,
  projectId: string,
): ResultAsync<BudgetAccess, DbError> =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, projectId) })
      .then((r) => r ?? null),
    (e) => new DbError("resolveBudgetAccess/loadProject", e),
  ).andThen((project) => {
    if (!project)
      return err(
        new DbError("resolveBudgetAccess", `project not found: ${projectId}`),
      );

    const isPersonalOwner =
      project.teamId === null && project.ownerId === userId;

    if (!project.teamId) {
      return ResultAsync.fromPromise(
        Promise.resolve({ projectId, isPersonalOwner, teamRole: null }),
        (e) => new DbError("resolveBudgetAccess/build", e),
      );
    }

    return ResultAsync.fromPromise(
      db.query.teamMembers
        .findFirst({
          where: (t) => eq(t.teamId, project.teamId!) && eq(t.userId, userId),
        })
        .then((m) => ({
          projectId,
          isPersonalOwner,
          teamRole: (m?.role as TeamRole | undefined) ?? null,
        })),
      (e) => new DbError("resolveBudgetAccess/teamMember", e),
    );
  });
