import {
  canEditProject,
  canViewProject,
  type ProjectAccessContext,
} from "@oh-writers/utils";

export type BreakdownPermissionContext = ProjectAccessContext;

export const canEditBreakdown = (ctx: BreakdownPermissionContext): boolean =>
  canEditProject(ctx);

export const canViewBreakdown = (ctx: BreakdownPermissionContext): boolean =>
  canViewProject(ctx);
