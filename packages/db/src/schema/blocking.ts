import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
// These types mirror @oh-writers/domain — cannot import across rootDir boundaries.
// Cast to the domain types at the feature layer.
type Primitive = Record<string, unknown>;
type ActorPosition = Record<string, unknown>;
type CameraPin = Record<string, unknown>;

import { projects } from "./projects";
import { scenes } from "./scenes";
import { shotPlanScenarios } from "./shot-plan";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateKey: text("template_key").notNull().default("empty"),
    gridSize: integer("grid_size").notNull().default(50),
    widthCm: integer("width_cm").notNull().default(1000),
    heightCm: integer("height_cm").notNull().default(800),
    primitives: jsonb("primitives").$type<Primitive[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.projectId)],
);

export const sceneBlockings = pgTable(
  "scene_blockings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    actorPositions: jsonb("actor_positions")
      .$type<ActorPosition[]>()
      .notNull()
      .default([]),
    isSuggested: boolean("is_suggested").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.sceneId)],
);

export const planSceneCameras = pgTable(
  "plan_scene_cameras",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    cameraPins: jsonb("camera_pins").$type<CameraPin[]>().notNull().default([]),
    detachedActors: boolean("detached_actors").notNull().default(false),
    overrideActorPositions: jsonb("override_actor_positions")
      .$type<ActorPosition[] | null>()
      .default(null),
    isSuggested: boolean("is_suggested").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.planId), index().on(t.sceneId)],
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type SceneBlocking = typeof sceneBlockings.$inferSelect;
export type NewSceneBlocking = typeof sceneBlockings.$inferInsert;
export type PlanSceneCamera = typeof planSceneCameras.$inferSelect;
export type NewPlanSceneCamera = typeof planSceneCameras.$inferInsert;
