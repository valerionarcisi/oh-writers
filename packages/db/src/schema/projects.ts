import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { teams } from "./teams";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    genre: text("genre", {
      enum: [
        "drama",
        "comedy",
        "thriller",
        "horror",
        "action",
        "sci-fi",
        "documentary",
        "other",
      ],
    }),
    format: text("format", {
      enum: ["feature", "short", "series_episode", "pilot"],
    }).notNull(),
    logline: text("logline"),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "owner_or_team",
      sql`${t.ownerId} IS NOT NULL OR ${t.teamId} IS NOT NULL`,
    ),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
