import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { scenes } from "./scenes";

export const shotPlans = pgTable(
  "shot_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    activeScenarioId: uuid("active_scenario_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.sceneId)],
);

export const shotPlanScenarios = pgTable("shot_plan_scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotPlanId: uuid("shot_plan_id")
    .notNull()
    .references(() => shotPlans.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Piano A"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shots = pgTable("shots", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  shotSize: text("shot_size").notNull(),
  cameraMovement: text("camera_movement").notNull(),
  estimatedMinutes: real("estimated_minutes"),
  notes: text("notes"),
  cameraLabel: text("camera_label").notNull().default("A"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transitionSlots = pgTable("transition_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
  afterShotId: uuid("after_shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  estimatedMinutes: real("estimated_minutes"),
  ruleId: text("rule_id"),
  isManual: boolean("is_manual").notNull().default(false),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ShotPlan = typeof shotPlans.$inferSelect;
export type ShotPlanScenario = typeof shotPlanScenarios.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type TransitionSlot = typeof transitionSlots.$inferSelect;
