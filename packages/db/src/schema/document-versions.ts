import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { documents } from "./documents";
import { cesareSessions } from "./cesare-sessions";

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    label: text("label"),
    content: text("content").notNull().default(""),
    draftColor: text("draft_color"),
    draftDate: date("draft_date"),
    isDraft: boolean("is_draft").notNull().default(false),
    // Spec 75 (BUG-N66) — non-null marks this row as the Cesare working version
    // of that chat session's turn group: consecutive Cesare edits from the same
    // session overwrite it in place instead of inserting a new version. Cleared
    // when the user claims the version (rename / meta update).
    cesareSessionId: uuid("cesare_session_id").references(
      () => cesareSessions.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.documentId, t.number)],
);

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
