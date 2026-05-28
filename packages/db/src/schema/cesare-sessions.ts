import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

// Spec 44 — resumable Cesare chat threads. One row per (project × user) thread
// the user has opened. Every assistant/user message persisted via the chat
// pipeline carries a session_id FK so the conversation can be re-hydrated on
// page reload or session-switch.
export const cesareSessions = pgTable(
  "cesare_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("cesare_sessions_project_user_idx").on(t.projectId, t.userId)],
);

export type CesareSessionRow = typeof cesareSessions.$inferSelect;
export type NewCesareSessionRow = typeof cesareSessions.$inferInsert;
