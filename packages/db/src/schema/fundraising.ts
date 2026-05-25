import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { teams } from "./teams";
import { users } from "./users";
import { projects } from "./projects";

export const FUNDRAISING_SOURCE_KINDS = [
  "substack",
  "wordpress",
  "generic_rss",
  "atom",
] as const;

export const FUNDRAISING_OPPORTUNITY_KINDS = [
  "bando_pubblico",
  "call_festival",
  "residenza",
  "grant_privato",
  "workshop",
  "pitch_forum",
  "other",
] as const;

export const FUNDRAISING_OPPORTUNITY_STATUSES = [
  "active",
  "expired",
  "unknown",
] as const;

export const FUNDRAISING_SAVE_STATES = [
  "saved",
  "dismissed",
  "applied",
] as const;

export type FundraisingSourceKind = (typeof FUNDRAISING_SOURCE_KINDS)[number];
export type FundraisingOpportunityKind =
  (typeof FUNDRAISING_OPPORTUNITY_KINDS)[number];
export type FundraisingOpportunityStatus =
  (typeof FUNDRAISING_OPPORTUNITY_STATUSES)[number];
export type FundraisingSaveState = (typeof FUNDRAISING_SAVE_STATES)[number];

export const fundraisingSources = pgTable(
  "fundraising_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    feedUrl: text("feed_url").notNull(),
    kind: text("kind", { enum: FUNDRAISING_SOURCE_KINDS }).notNull(),
    language: text("language").notNull().default("it"),
    isCurated: boolean("is_curated").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    lastFetchedAt: timestamp("last_fetched_at"),
    lastError: text("last_error"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("fundraising_sources_feed_team_unique").on(t.feedUrl, t.teamId),
    index("fundraising_sources_team_idx").on(t.teamId),
  ],
);

export const fundraisingItems = pgTable(
  "fundraising_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => fundraisingSources.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at"),
    rawHtml: text("raw_html").notNull().default(""),
    rawText: text("raw_text").notNull().default(""),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    unique("fundraising_items_source_guid_unique").on(t.sourceId, t.guid),
    index("fundraising_items_published_idx").on(t.publishedAt),
  ],
);

export const fundraisingOpportunities = pgTable(
  "fundraising_opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => fundraisingItems.id, { onDelete: "cascade" })
      .unique(),
    kind: text("kind", { enum: FUNDRAISING_OPPORTUNITY_KINDS }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    organization: text("organization"),
    deadlineAt: timestamp("deadline_at"),
    deadlineText: text("deadline_text"),
    amountMin: numeric("amount_min", { precision: 12, scale: 2 }),
    amountMax: numeric("amount_max", { precision: 12, scale: 2 }),
    amountText: text("amount_text"),
    eligibility: jsonb("eligibility")
      .$type<{
        formats?: string[];
        genres?: string[];
        regions?: string[];
        careerStage?: string[];
      }>()
      .notNull()
      .default({}),
    requirements: text("requirements"),
    link: text("link").notNull(),
    status: text("status", { enum: FUNDRAISING_OPPORTUNITY_STATUSES })
      .notNull()
      .default("unknown"),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("0"),
    classifiedAt: timestamp("classified_at").notNull().defaultNow(),
  },
  (t) => [
    index("fundraising_opportunities_status_idx").on(t.status),
    index("fundraising_opportunities_deadline_idx").on(t.deadlineAt),
    index("fundraising_opportunities_kind_idx").on(t.kind),
  ],
);

export const fundraisingSaves = pgTable(
  "fundraising_saves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => fundraisingOpportunities.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: text("state", { enum: FUNDRAISING_SAVE_STATES }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("fundraising_saves_opportunity_project_unique").on(
      t.opportunityId,
      t.projectId,
    ),
    index("fundraising_saves_project_idx").on(t.projectId),
  ],
);

export type FundraisingSource = typeof fundraisingSources.$inferSelect;
export type NewFundraisingSource = typeof fundraisingSources.$inferInsert;
export type FundraisingItem = typeof fundraisingItems.$inferSelect;
export type NewFundraisingItem = typeof fundraisingItems.$inferInsert;
export type FundraisingOpportunity =
  typeof fundraisingOpportunities.$inferSelect;
export type NewFundraisingOpportunity =
  typeof fundraisingOpportunities.$inferInsert;
export type FundraisingSave = typeof fundraisingSaves.$inferSelect;
export type NewFundraisingSave = typeof fundraisingSaves.$inferInsert;
