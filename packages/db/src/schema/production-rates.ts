import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

/**
 * Per-project production rates. Each (project_id, key) pair is unique and
 * represents a single tunable production cost (e.g. `castLeadDay` = 800 EUR).
 * Used by the scene cost estimate and, in v2, exposed via a Settings UI.
 */
export const productionRates = pgTable(
  "production_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: numeric("value").notNull(),
    unit: text("unit").notNull().default("day"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("production_rates_project_key_idx").on(t.projectId, t.key),
    unique("production_rates_project_key_uq").on(t.projectId, t.key),
  ],
);
