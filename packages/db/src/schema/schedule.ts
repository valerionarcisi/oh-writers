import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { scenes } from "./scenes";

export const schedules = pgTable("schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Piano di Lavorazione"),
  startDate: date("start_date"),
  countryCode: text("country_code").notNull().default("IT"),
  status: text("status", { enum: ["draft", "locked"] })
    .notNull()
    .default("draft"),
  effortWeights: jsonb("effort_weights").$type<Record<string, number>>(),
  // Spec 89 — AI disclosure stamp. Set true the first time a Cesare tool
  // (move_scene_to_day, merge_days, swap_scenes, suggest_reorder) mutates
  // any strip/day of this schedule, and NEVER reset — a later manual
  // reorder must not erase the fact that Cesare touched it once. One flag
  // per schedule, not per strip/day: Cesare tools mutate multiple rows in
  // one call, so tracking "which row" has no clean meaning here.
  everAiTouched: boolean("ever_ai_touched").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shootingDays = pgTable("shooting_days", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => schedules.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  date: date("date"),
  dayType: text("day_type", { enum: ["shoot", "travel", "rest", "prep"] })
    .notNull()
    .default("shoot"),
  notes: text("notes"),
  crewCallTime: text("crew_call_time"),
  shootStartTime: text("shoot_start_time"),
  wrapTime: text("wrap_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const strips = pgTable("strips", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => schedules.id, { onDelete: "cascade" }),
  shootingDayId: uuid("shooting_day_id").references(() => shootingDays.id, {
    onDelete: "set null",
  }),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  bannerColor: text("banner_color", {
    enum: ["white", "yellow", "blue", "green", "red", "pink", "grey"],
  })
    .notNull()
    .default("white"),
  isLocked: boolean("is_locked").notNull().default(false),
  estimatedHours: real("estimated_hours"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type ShootingDay = typeof shootingDays.$inferSelect;
export type NewShootingDay = typeof shootingDays.$inferInsert;
export type Strip = typeof strips.$inferSelect;
export type NewStrip = typeof strips.$inferInsert;
