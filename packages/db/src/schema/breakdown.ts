import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { scenes } from "./scenes";
import { screenplayVersions } from "./screenplays";

export const BREAKDOWN_CATEGORIES = [
  "cast",
  "extras",
  "stunts",
  "props",
  "vehicles",
  "wardrobe",
  "makeup",
  "sfx",
  "vfx",
  "sound",
  "animals",
  "atmosphere",
  "set_dress",
  "equipment",
  "locations",
] as const;

export type BreakdownCategoryDb = (typeof BREAKDOWN_CATEGORIES)[number];

export const CESARE_STATUSES = ["pending", "accepted", "ignored"] as const;
export type CesareStatusDb = (typeof CESARE_STATUSES)[number];

export const CAST_TIERS_DB = [
  "principal",
  "supporting",
  "day_player",
  "featured_extra",
] as const;
export type CastTierDb = (typeof CAST_TIERS_DB)[number];

export const breakdownElements = pgTable(
  "breakdown_elements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: text("category", { enum: BREAKDOWN_CATEGORIES }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    castTier: text("cast_tier", { enum: CAST_TIERS_DB }),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("breakdown_elements_project_category_name_uq").on(
      t.projectId,
      t.category,
      t.name,
    ),
  ],
);

export const breakdownOccurrences = pgTable(
  "breakdown_occurrences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    elementId: uuid("element_id")
      .notNull()
      .references(() => breakdownElements.id, { onDelete: "cascade" }),
    screenplayVersionId: uuid("screenplay_version_id")
      .notNull()
      .references(() => screenplayVersions.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    note: text("note"),
    cesareStatus: text("cesare_status", { enum: CESARE_STATUSES })
      .notNull()
      .default("accepted"),
    isStale: boolean("is_stale").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("breakdown_occurrences_element_version_scene_uq").on(
      t.elementId,
      t.screenplayVersionId,
      t.sceneId,
    ),
  ],
);

export const breakdownSceneState = pgTable(
  "breakdown_scene_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    screenplayVersionId: uuid("screenplay_version_id")
      .notNull()
      .references(() => screenplayVersions.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    textHash: text("text_hash").notNull(),
    lastCesareRunAt: timestamp("last_cesare_run_at"),
    lastAutoSpoglioRunAt: timestamp("last_auto_spoglio_run_at"),
    pageEighths: integer("page_eighths"),
  },
  (t) => [
    unique("breakdown_scene_state_version_scene_uq").on(
      t.screenplayVersionId,
      t.sceneId,
    ),
  ],
);

export const breakdownVersionState = pgTable("breakdown_version_state", {
  versionId: uuid("version_id")
    .primaryKey()
    .references(() => screenplayVersions.id, { onDelete: "cascade" }),
  lastFullSpoglioRunAt: timestamp("last_full_spoglio_run_at"),
  modelUsed: text("model_used"),
  scenesTotal: integer("scenes_total"),
  scenesDone: integer("scenes_done").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const breakdownRateLimits = pgTable(
  "breakdown_rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    lastInvokedAt: timestamp("last_invoked_at").notNull().defaultNow(),
  },
  (t) => [
    unique("breakdown_rate_limits_project_action_uq").on(t.projectId, t.action),
  ],
);

export type BreakdownElement = typeof breakdownElements.$inferSelect;
export type NewBreakdownElement = typeof breakdownElements.$inferInsert;
export type BreakdownOccurrence = typeof breakdownOccurrences.$inferSelect;
export type NewBreakdownOccurrence = typeof breakdownOccurrences.$inferInsert;
export type BreakdownSceneState = typeof breakdownSceneState.$inferSelect;
export type NewBreakdownSceneState = typeof breakdownSceneState.$inferInsert;
export type BreakdownRateLimit = typeof breakdownRateLimits.$inferSelect;
export type NewBreakdownRateLimit = typeof breakdownRateLimits.$inferInsert;
export type BreakdownVersionState = typeof breakdownVersionState.$inferSelect;
export type NewBreakdownVersionState =
  typeof breakdownVersionState.$inferInsert;
