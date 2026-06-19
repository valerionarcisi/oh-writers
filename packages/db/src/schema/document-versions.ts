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

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    label: text("label"),
    // BUG-N66 / Spec 76 — distinguishes a user-meaningful checkpoint from an
    // in-place Cesare working copy. "manual" (the default) keeps every existing
    // row valid without a backfill: rows that predate the checkpoint model are
    // all user-meaningful. "checkpoint" is the auto pre-session snapshot that
    // rollback targets; "working" is the live Cesare row that small edits
    // overwrite into. The Versions list collapses "working" rows under their
    // owning "checkpoint".
    kind: text("kind").notNull().default("manual"),
    // The Cesare session a "working"/"checkpoint" row belongs to (Spec 76).
    // Lets the commit seam find "the working row of THIS session" to overwrite,
    // and the Versions list collapse working rows under their session checkpoint.
    // Nullable: "manual" user versions have no owning session.
    cesareSessionId: uuid("cesare_session_id"),
    content: text("content").notNull().default(""),
    draftColor: text("draft_color"),
    draftDate: date("draft_date"),
    isDraft: boolean("is_draft").notNull().default(false),
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
