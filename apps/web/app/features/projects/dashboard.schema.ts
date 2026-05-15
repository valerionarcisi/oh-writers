import { z } from "zod";
import { Formats, Genres, TeamRoles } from "@oh-writers/domain";

type FormatValue = (typeof Formats)[keyof typeof Formats];
type GenreValue = (typeof Genres)[keyof typeof Genres];
type RoleValue = (typeof TeamRoles)[keyof typeof TeamRoles];

const formatValues = Object.values(Formats) as unknown as [
  FormatValue,
  ...FormatValue[],
];
const genreValues = Object.values(Genres) as unknown as [
  GenreValue,
  ...GenreValue[],
];

export const DashboardCollaboratorSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});

export const DashboardStatsSchema = z.object({
  sceneCount: z.number().int().min(0),
  pageCount: z.number().int().min(0),
  completionPercent: z.number().int().min(0).max(100),
  scheduledDays: z.number().int().min(0),
  totalCharacters: z.number().int().min(0),
});

export const DashboardActivityKinds = {
  SCREENPLAY_EDIT: "screenplay_edit",
  DOCUMENT_EDIT: "document_edit",
  PROJECT_CREATED: "project_created",
} as const;

export type DashboardActivityKind =
  (typeof DashboardActivityKinds)[keyof typeof DashboardActivityKinds];

export const DashboardActivitySchema = z.object({
  atIso: z.string(),
  kind: z.enum([
    DashboardActivityKinds.SCREENPLAY_EDIT,
    DashboardActivityKinds.DOCUMENT_EDIT,
    DashboardActivityKinds.PROJECT_CREATED,
  ]),
  label: z.string(),
});

export const DashboardProjectRoleSchema = z.enum([
  TeamRoles.OWNER,
  TeamRoles.EDITOR,
  TeamRoles.VIEWER,
]);

export const DashboardProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  format: z.enum(formatValues),
  genre: z.enum(genreValues).nullable(),
  role: DashboardProjectRoleSchema,
  isArchived: z.boolean(),
  isShared: z.boolean(),
  isPersonal: z.boolean(),
  coverGradient: z.string(),
  stats: DashboardStatsSchema,
  lastActivity: DashboardActivitySchema,
  collaborators: z.array(DashboardCollaboratorSchema),
  updatedAtIso: z.string(),
});

export type DashboardProject = z.infer<typeof DashboardProjectSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type DashboardCollaborator = z.infer<typeof DashboardCollaboratorSchema>;
export type DashboardActivity = z.infer<typeof DashboardActivitySchema>;
export type DashboardProjectRole = z.infer<typeof DashboardProjectRoleSchema>;

export const DashboardFilterTabs = {
  ALL: "all",
  PERSONAL: "personal",
  SHARED: "shared",
  ARCHIVED: "archived",
} as const;

export type DashboardFilterTab =
  (typeof DashboardFilterTabs)[keyof typeof DashboardFilterTabs];

export const DashboardSortKeys = {
  UPDATED: "updated",
  TITLE: "title",
  SCENES: "scenes",
} as const;

export type DashboardSortKey =
  (typeof DashboardSortKeys)[keyof typeof DashboardSortKeys];

export const DashboardViewModes = {
  GRID: "grid",
  LIST: "list",
} as const;

export type DashboardViewMode =
  (typeof DashboardViewModes)[keyof typeof DashboardViewModes];
