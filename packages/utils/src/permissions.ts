import type { TeamRole } from "@oh-writers/domain";

/**
 * Access derived from a user's relationship to a project, reduced to the two
 * facts every caller actually needs: whether they own a personal (team-less)
 * project, and their team role if the project belongs to a team.
 *
 * This is the single source of truth for the view/edit/own predicates, shared
 * by the web server functions and the realtime ws-server room-access check so
 * the two can never drift.
 */
export interface ProjectAccessContext {
  isPersonalOwner: boolean;
  teamRole: TeamRole | null;
}

export const isProjectOwner = (ctx: ProjectAccessContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole === "owner";

export const canEditProject = (ctx: ProjectAccessContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole === "owner" || ctx.teamRole === "editor";

export const canViewProject = (ctx: ProjectAccessContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole !== null;
