import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  unique,
  index,
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
    // FK enforced via raw SQL migration (deferred circular ref)
    activeScenarioId: uuid("active_scenario_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.sceneId), index().on(t.projectId)],
);

export const shotPlanScenarios = pgTable(
  "shot_plan_scenarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shotPlanId: uuid("shot_plan_id")
      .notNull()
      .references(() => shotPlans.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Plan A"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index().on(t.shotPlanId)],
);

export const shots = pgTable(
  "shots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    shotSize: text("shot_size", {
      enum: [
        "EWS",
        "WS",
        "MS",
        "MCU",
        "CU",
        "ECU",
        "INSERT",
        "OTS",
        "TWO_SHOT",
        "POV",
      ] as [string, ...string[]],
    }).notNull(),
    cameraMovement: text("camera_movement", {
      enum: [
        "STATIC",
        "PAN",
        "TILT",
        "DOLLY",
        "HANDHELD",
        "STEADICAM",
        "CRANE",
        "DRONE",
        "ZOOM",
      ] as [string, ...string[]],
    }).notNull(),
    estimatedMinutes: real("estimated_minutes"),
    notes: text("notes"),
    cameraLabel: text("camera_label", {
      enum: ["A", "B", "C", "D"] as [string, ...string[]],
    })
      .notNull()
      .default("A"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.scenarioId), index().on(t.position)],
);

export const transitionSlots = pgTable(
  "transition_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
    afterShotId: uuid("after_shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["SETUP_CHANGE", "MAKEUP_COSTUME", "BREAK", "TRAVEL"] as [
        string,
        ...string[],
      ],
    }).notNull(),
    estimatedMinutes: real("estimated_minutes"),
    ruleId: text("rule_id"),
    isManual: boolean("is_manual").notNull().default(false),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.scenarioId), index().on(t.afterShotId)],
);

export type ShotPlan = typeof shotPlans.$inferSelect;
export type NewShotPlan = typeof shotPlans.$inferInsert;
export type ShotPlanScenario = typeof shotPlanScenarios.$inferSelect;
export type NewShotPlanScenario = typeof shotPlanScenarios.$inferInsert;
export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
export type TransitionSlot = typeof transitionSlots.$inferSelect;
export type NewTransitionSlot = typeof transitionSlots.$inferInsert;
