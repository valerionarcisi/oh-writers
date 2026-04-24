export const TeamRoles = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export type TeamRole = (typeof TeamRoles)[keyof typeof TeamRoles];

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

export const DOCUMENT_PIPELINE = [
  DocumentTypes.LOGLINE,
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
