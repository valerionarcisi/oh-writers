-- Spec 82 — persist Cesare editorial-advice "Segna" decisions per project/doc/
-- scene/area/anchor so anti-repetition context survives across sessions
-- instead of living only in localStorage.
CREATE TABLE "editorial_advice_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "doc_type" text NOT NULL,
  "scene_id" uuid REFERENCES "scenes"("id") ON DELETE CASCADE,
  "area" text NOT NULL,
  "anchor_text" text NOT NULL DEFAULT '',
  "title_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Postgres treats every NULL as distinct in a plain UNIQUE constraint, so one
-- constraint over the nullable scene_id would never match two doc-level
-- (scene_id IS NULL) rows — every re-mark of a narrative-doc decision would
-- INSERT a duplicate instead of updating. Two partial unique indexes close
-- both cases.
CREATE UNIQUE INDEX "editorial_advice_decisions_scene_key" ON "editorial_advice_decisions" (
  "project_id", "doc_type", "scene_id", "area", "anchor_text", "title_fingerprint"
) WHERE "scene_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_advice_decisions_doc_key" ON "editorial_advice_decisions" (
  "project_id", "doc_type", "area", "anchor_text", "title_fingerprint"
) WHERE "scene_id" IS NULL;
