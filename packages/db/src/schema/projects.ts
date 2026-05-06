import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
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
    titlePageAuthor: text("title_page_author"),
    titlePageBasedOn: text("title_page_based_on"),
    titlePageContact: text("title_page_contact"),
    titlePageDraftDate: date("title_page_draft_date"),
    titlePageDraftColor: text("title_page_draft_color", {
      enum: [
        "white",
        "blue",
        "pink",
        "yellow",
        "green",
        "goldenrod",
        "buff",
        "salmon",
        "cherry",
        "tan",
      ],
    }),
    titlePageWgaRegistration: text("title_page_wga_registration"),
    titlePageNotes: text("title_page_notes"),
    titlePageDoc:
      jsonb("title_page_doc").$type<Record<string, NonNullable<unknown>>>(),
    siaeMetadata:
      jsonb("siae_metadata").$type<Record<string, NonNullable<unknown>>>(),
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
