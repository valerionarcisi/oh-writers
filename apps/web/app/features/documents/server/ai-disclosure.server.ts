import { and, eq, isNotNull } from "drizzle-orm";
import { documents, documentVersions } from "@oh-writers/db/schema";
import type { DocumentType } from "@oh-writers/domain";
import { ResultAsync } from "neverthrow";
import { DbError } from "../documents.errors";
import type { Db } from "~/server/db";

/**
 * Spec 89 — AI disclosure stamp. True if the given document type EVER had a
 * version with a non-null cesareSessionId, regardless of the currently
 * active version. Permanent: document history is never deleted, so this
 * never flips back to false once true.
 *
 * Shared by every narrative-document export path (Soggetto SIAE/DOCX today;
 * the combined Logline+Synopsis+Treatment PDF calls this once per type and
 * ORs the results — Spec 89 phase 2).
 */
export const loadDocumentEverAiTouched = (
  db: Db,
  projectId: string,
  type: DocumentType,
): ResultAsync<boolean, DbError> =>
  ResultAsync.fromPromise(
    (async (): Promise<boolean> => {
      const doc = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, projectId),
          eq(documents.type, type),
        ),
      });
      if (!doc) return false;
      const touched = await db.query.documentVersions.findFirst({
        where: and(
          eq(documentVersions.documentId, doc.id),
          isNotNull(documentVersions.cesareSessionId),
        ),
      });
      return touched !== undefined;
    })(),
    (e) => new DbError("documents/loadEverAiTouched", e),
  );
