import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { projects } from "./projects";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const screenplays = pgTable("screenplays", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  yjsState: bytea("yjs_state"),
  content: text("content").notNull().default(""),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const screenplayVersions = pgTable("screenplay_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenplayId: uuid("screenplay_id")
    .notNull()
    .references(() => screenplays.id, { onDelete: "cascade" }),
  label: text("label"),
  content: text("content").notNull(),
  yjsSnapshot: bytea("yjs_snapshot"),
  pageCount: integer("page_count").notNull().default(0),
  isAuto: boolean("is_auto").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const screenplayBranches = pgTable("screenplay_branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenplayId: uuid("screenplay_id")
    .notNull()
    .references(() => screenplays.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fromVersionId: uuid("from_version_id").references(
    () => screenplayVersions.id,
  ),
  content: text("content").notNull().default(""),
  yjsState: bytea("yjs_state"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Screenplay = typeof screenplays.$inferSelect;
export type NewScreenplay = typeof screenplays.$inferInsert;
export type ScreenplayVersion = typeof screenplayVersions.$inferSelect;
export type NewScreenplayVersion = typeof screenplayVersions.$inferInsert;
export type ScreenplayBranch = typeof screenplayBranches.$inferSelect;
