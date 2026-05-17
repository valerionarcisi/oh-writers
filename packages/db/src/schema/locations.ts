import {
  pgTable,
  uuid,
  text,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { breakdownElements } from "./breakdown";
import { scenes } from "./scenes";

export const LOCATION_REQUIREMENT_STATUSES = [
  "pending",
  "scouting",
  "confirmed",
  "locked",
] as const;

export const LOCATION_CANDIDATE_STATUSES = [
  "candidate",
  "visited",
  "rejected",
  "confirmed",
] as const;

export const INT_EXT_VALUES = ["INT", "EXT", "INT/EXT"] as const;

export type LocationRequirementStatus =
  (typeof LOCATION_REQUIREMENT_STATUSES)[number];
export type LocationCandidateStatus =
  (typeof LOCATION_CANDIDATE_STATUSES)[number];

export const locationRequirements = pgTable("location_requirements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  breakdownElementId: uuid("breakdown_element_id").references(
    () => breakdownElements.id,
    { onDelete: "set null" },
  ),
  name: text("name").notNull(),
  description: text("description"),
  intExt: text("int_ext", { enum: INT_EXT_VALUES }),
  timeOfDay: jsonb("time_of_day").$type<string[]>().default([]),
  confirmedCandidateId: uuid("confirmed_candidate_id"),
  status: text("status", { enum: LOCATION_REQUIREMENT_STATUSES })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const locationRequirementScenes = pgTable(
  "location_requirement_scenes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => locationRequirements.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
  },
);

export const locationCandidates = pgTable("location_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  requirementId: uuid("requirement_id")
    .notNull()
    .references(() => locationRequirements.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  estimatedDailyFee: real("estimated_daily_fee"),
  permitRequired: boolean("permit_required"),
  permitNotes: text("permit_notes"),
  availableFrom: date("available_from"),
  availableTo: date("available_to"),
  notes: text("notes"),
  status: text("status", { enum: LOCATION_CANDIDATE_STATUSES })
    .notNull()
    .default("candidate"),
  aiSuggested: boolean("ai_suggested").notNull().default(false),
  aiReasoning: text("ai_reasoning"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const locationPhotos = pgTable("location_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => locationCandidates.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export type LocationRequirement = typeof locationRequirements.$inferSelect;
export type NewLocationRequirement = typeof locationRequirements.$inferInsert;
export type LocationCandidate = typeof locationCandidates.$inferSelect;
export type NewLocationCandidate = typeof locationCandidates.$inferInsert;
export type LocationPhoto = typeof locationPhotos.$inferSelect;
export type NewLocationPhoto = typeof locationPhotos.$inferInsert;
