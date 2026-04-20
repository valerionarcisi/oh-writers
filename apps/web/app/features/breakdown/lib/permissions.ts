import type { TeamRole } from "@oh-writers/domain";

export interface BreakdownPermissionContext {
  isPersonalOwner: boolean;
  teamRole: TeamRole | null;
}

export const canEditBreakdown = (ctx: BreakdownPermissionContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole === "owner" || ctx.teamRole === "editor";

export const canViewBreakdown = (ctx: BreakdownPermissionContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole !== null;
