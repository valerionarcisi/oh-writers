export const TeamRoles = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export type TeamRole = (typeof TeamRoles)[keyof typeof TeamRoles];

/**
 * User-facing Italian labels for team roles. Single source of truth for every
 * surface (dashboard filter, project card badges, settings team list) so the
 * raw English enum value never reaches the IT-localised UI.
 */
export const TEAM_ROLE_LABELS_IT: Record<TeamRole, string> = {
  owner: "Proprietario",
  editor: "Editor",
  viewer: "Visualizzatore",
} as const;

export const Genres = {
  DRAMA: "drama",
  COMEDY: "comedy",
  THRILLER: "thriller",
  HORROR: "horror",
  ACTION: "action",
  SCI_FI: "sci-fi",
  DOCUMENTARY: "documentary",
  OTHER: "other",
} as const;

export type Genre = (typeof Genres)[keyof typeof Genres];

export const Formats = {
  FEATURE: "feature",
  SHORT: "short",
  SERIES_EPISODE: "series_episode",
  PILOT: "pilot",
} as const;

export type Format = (typeof Formats)[keyof typeof Formats];

export const DocumentTypes = {
  LOGLINE: "logline",
  SOGGETTO: "soggetto",
  SYNOPSIS: "synopsis",
  OUTLINE: "outline",
  TREATMENT: "treatment",
} as const;

export type DocumentType = (typeof DocumentTypes)[keyof typeof DocumentTypes];

/**
 * User-facing Italian labels for each document type. Single source of truth for
 * every surface (overview cards, seed titles, new-project document titles) so a
 * stored English `title` never leaks to the IT-localised UI.
 */
export const DOCUMENT_TYPE_LABELS_IT: Record<DocumentType, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
} as const;

export const Locales = {
  IT: "it",
  EN: "en",
} as const;

export type Locale = (typeof Locales)[keyof typeof Locales];

/**
 * English team-role labels. The `_IT` map above stays the canonical IT source;
 * `teamRoleLabel` picks the right one for the active locale. Display surfaces
 * call the accessor; persisted data (DB titles) may still use the IT map at the
 * creator's locale.
 */
export const TEAM_ROLE_LABELS_EN: Record<TeamRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
} as const;

export const teamRoleLabel = (role: TeamRole, locale: Locale): string =>
  (locale === "it" ? TEAM_ROLE_LABELS_IT : TEAM_ROLE_LABELS_EN)[role];

/** English document-type labels (counterpart to `DOCUMENT_TYPE_LABELS_IT`). */
export const DOCUMENT_TYPE_LABELS_EN: Record<DocumentType, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Synopsis",
  outline: "Outline",
  treatment: "Treatment",
} as const;

export const documentTypeLabel = (type: DocumentType, locale: Locale): string =>
  (locale === "it" ? DOCUMENT_TYPE_LABELS_IT : DOCUMENT_TYPE_LABELS_EN)[type];

export const DOCUMENT_PIPELINE = [
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
] as const;

export const PredictionTypes = {
  PRODUCTION_COST: "production_cost",
  WEATHER_RISK: "weather_risk",
} as const;

export type PredictionType =
  (typeof PredictionTypes)[keyof typeof PredictionTypes];

export const IntExtValues = {
  INT: "INT",
  EXT: "EXT",
  INT_EXT: "INT/EXT",
} as const;

export type IntExt = (typeof IntExtValues)[keyof typeof IntExtValues];
