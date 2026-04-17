import { ResultAsync } from "neverthrow";
import { and, eq } from "drizzle-orm";
import { TeamRoles } from "@oh-writers/domain";
import { DbError } from "@oh-writers/utils";
import { teamMembers } from "@oh-writers/db/schema";
import type { TeamMember } from "@oh-writers/db/schema";
import type { Db } from "./db";

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const getMembership = (
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

// ─── Predicates ───────────────────────────────────────────────────────────────

type ProjectRefForEdit = {
  ownerId: string | null;
  teamId: string | null;
  isArchived: boolean;
};

type ProjectRefForOwnership = {
  ownerId: string | null;
  teamId: string | null;
};

/**
 * A user can edit a project if:
 * - the project is not archived, AND
 * - they are the personal owner (teamId null, ownerId = userId), OR
 * - they have a team membership with role OWNER or EDITOR.
 */
export const canEdit = (
  project: ProjectRefForEdit,
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

/**
 * A user is the owner of a project if:
 * - they are the personal owner (teamId null, ownerId = userId), OR
 * - they have a team membership with role OWNER.
 */
export const isOwner = (
  project: ProjectRefForOwnership,
  userId: string,
  membership: TeamMember | null,
): boolean => {
  if (project.ownerId === userId && project.teamId === null) return true;
  return membership?.role === TeamRoles.OWNER;
};
