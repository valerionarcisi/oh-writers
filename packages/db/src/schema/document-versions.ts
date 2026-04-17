import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
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
    content: text("content").notNull().default(""),
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
