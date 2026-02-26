import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { screenplays } from "./screenplays";

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    screenplayId: uuid("screenplay_id")
      .notNull()
      .references(() => screenplays.id, { onDelete: "cascade" }),
    // Scene position is the stable identity key — upsert by (screenplayId, number)
    number: integer("number").notNull(),
    heading: text("heading").notNull(),
    intExt: text("int_ext", { enum: ["INT", "EXT", "INT/EXT"] }).notNull(),
    location: text("location").notNull(),
    timeOfDay: text("time_of_day"),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    characterNames: text("character_names").array().notNull().default([]),
    hasVehicle: boolean("has_vehicle").notNull().default(false),
    hasSpecialEffect: boolean("has_special_effect").notNull().default(false),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.screenplayId, t.number)],
);

export const characters = pgTable("characters", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenplayId: uuid("screenplay_id")
    .notNull()
    .references(() => screenplays.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name"),
  sceneCount: integer("scene_count").notNull().default(0),
  dialogueLines: integer("dialogue_lines").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;
export type Character = typeof characters.$inferSelect;
