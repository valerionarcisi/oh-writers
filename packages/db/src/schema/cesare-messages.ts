import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { cesareSessions } from "./cesare-sessions";

// Spec 51 — persisted Cesare chat messages. One row per user/assistant bubble,
// FK'd to the parent `cesare_sessions` thread so a session's conversation
// survives reload and can be derived into a transcript markdown.
//
// `metadata` is the runtime-only enrichment the chat reducer holds in memory
// (the live step trace for an assistant turn + the doc-applied/version markers
// of any edit that turn produced). It is OPTIONAL context for the transcript
// derivation, never a second source of truth: the authoritative edit record is
// still `document_versions` + the diff markers. Stored as jsonb so the
// transcript builder can render the trace + link to per-edit changelog entries
// without re-running the model.
export const cesareMessages = pgTable(
  "cesare_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => cesareSessions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("cesare_messages_session_idx").on(t.sessionId, t.createdAt)],
);

export type CesareMessageRow = typeof cesareMessages.$inferSelect;
export type NewCesareMessageRow = typeof cesareMessages.$inferInsert;
