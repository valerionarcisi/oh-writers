import {
  pgTable,
  uuid,
  text,
  timestamp,
  customType,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { projects } from "./projects";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["logline", "soggetto", "synopsis", "outline", "treatment"],
    }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    currentVersionId: uuid("current_version_id"),
    yjsState: bytea("yjs_state"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.type)],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
