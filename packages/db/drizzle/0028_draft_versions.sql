ALTER TABLE "screenplay_versions" ADD COLUMN "is_draft" boolean NOT NULL DEFAULT false;
ALTER TABLE "document_versions" ADD COLUMN "is_draft" boolean NOT NULL DEFAULT false;
