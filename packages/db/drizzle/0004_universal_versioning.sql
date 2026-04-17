-- Spec 06b — Universal Document Versioning
-- Introduces `document_versions` for narrative docs (logline, synopsis,
-- outline, treatment) and gives both narrative and screenplay a pointer
-- to the active version. Drops the legacy auto-version flag.

CREATE TABLE "document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "number" integer NOT NULL,
  "label" text,
  "content" text NOT NULL DEFAULT '',
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "document_versions_document_id_number_unique" UNIQUE ("document_id", "number")
);
--> statement-breakpoint

ALTER TABLE "documents" ADD COLUMN "current_version_id" uuid;
--> statement-breakpoint

-- Backfill: one VERSION-1 per existing document, copying legacy content.
INSERT INTO "document_versions" ("document_id", "number", "content", "created_by")
SELECT "id", 1, "content", "created_by" FROM "documents";
--> statement-breakpoint

UPDATE "documents" d
SET "current_version_id" = dv."id"
FROM "document_versions" dv
WHERE dv."document_id" = d."id" AND dv."number" = 1;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_current_version_id_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id");
--> statement-breakpoint

-- Screenplay: numbering + current pointer, drop auto flag.
ALTER TABLE "screenplay_versions" ADD COLUMN "number" integer NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Renumber existing versions per screenplay by creation order.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "screenplay_id" ORDER BY "created_at" ASC) AS rn
  FROM "screenplay_versions"
)
UPDATE "screenplay_versions" sv
SET "number" = ranked.rn
FROM ranked
WHERE sv."id" = ranked."id";
--> statement-breakpoint

ALTER TABLE "screenplay_versions"
  ADD CONSTRAINT "screenplay_versions_screenplay_id_number_unique"
  UNIQUE ("screenplay_id", "number");
--> statement-breakpoint

-- `is_auto` stays for now — Block 4 (server rewrite) removes it alongside the
-- auto-versioning code path, so existing callers keep compiling in between.

ALTER TABLE "screenplays" ADD COLUMN "current_version_id" uuid;
--> statement-breakpoint

-- Seed a VERSION-1 for screenplays that have no versions yet.
INSERT INTO "screenplay_versions" ("screenplay_id", "number", "content", "page_count", "created_by")
SELECT s."id", 1, s."content", s."page_count", s."created_by"
FROM "screenplays" s
WHERE NOT EXISTS (
  SELECT 1 FROM "screenplay_versions" sv WHERE sv."screenplay_id" = s."id"
);
--> statement-breakpoint

-- Point each screenplay at its latest version (highest number).
UPDATE "screenplays" s
SET "current_version_id" = sv."id"
FROM "screenplay_versions" sv
WHERE sv."screenplay_id" = s."id"
  AND sv."number" = (
    SELECT MAX("number") FROM "screenplay_versions" WHERE "screenplay_id" = s."id"
  );
--> statement-breakpoint

ALTER TABLE "screenplays"
  ADD CONSTRAINT "screenplays_current_version_id_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "screenplay_versions"("id");
