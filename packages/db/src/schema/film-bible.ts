import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const filmBibles = pgTable("project_film_bible", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  bible: jsonb("bible").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FilmBibleRow = typeof filmBibles.$inferSelect;
export type NewFilmBibleRow = typeof filmBibles.$inferInsert;
