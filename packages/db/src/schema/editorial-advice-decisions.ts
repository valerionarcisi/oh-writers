import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { scenes } from "./scenes";

// Spec 82 — persists a writer's "Segna" decision on an editorial-advice note so
// Cesare's anti-repetition/OK-editoriale checks can reuse it across sessions.
// Keyed to the text anchor, not a whole-document content fingerprint (that key
// wiped every decision on unrelated edits — see localStorage predecessor).
export const editorialAdviceDecisions = pgTable(
  "editorial_advice_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    sceneId: uuid("scene_id").references(() => scenes.id, {
      onDelete: "cascade",
    }),
    area: text("area").notNull(),
    anchorText: text("anchor_text").notNull().default(""),
    titleFingerprint: text("title_fingerprint").notNull(),
    status: text("status", {
      enum: ["authorial_choice", "ignored", "resolved", "approved"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Postgres treats every NULL as distinct in a plain UNIQUE constraint, so a
  // single constraint over a nullable scene_id never matches two doc-level
  // (scene_id IS NULL) rows — every re-mark of a narrative-doc decision would
  // INSERT a duplicate instead of updating. Two partial unique indexes close
  // both cases: one keyed on the real scene_id, one scoped to NULL scene_id.
  (t) => [
    uniqueIndex("editorial_advice_decisions_scene_key")
      .on(
        t.projectId,
        t.docType,
        t.sceneId,
        t.area,
        t.anchorText,
        t.titleFingerprint,
      )
      .where(sql`${t.sceneId} is not null`),
    uniqueIndex("editorial_advice_decisions_doc_key")
      .on(t.projectId, t.docType, t.area, t.anchorText, t.titleFingerprint)
      .where(sql`${t.sceneId} is null`),
  ],
);

export type EditorialAdviceDecisionRow =
  typeof editorialAdviceDecisions.$inferSelect;
export type NewEditorialAdviceDecisionRow =
  typeof editorialAdviceDecisions.$inferInsert;
