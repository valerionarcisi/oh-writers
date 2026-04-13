import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, and } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { documents } from "@oh-writers/db/schema";
import type { Document } from "@oh-writers/db";
import type { DocumentType } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { stripYjsState } from "~/server/helpers";
import { SaveDocumentInput, GetDocumentInput } from "../documents.schema";
import {
  DocumentNotFoundError,
  ForbiddenError,
  DbError,
} from "../documents.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentView = Omit<Document, "yjsState">;

// ─── Get document ─────────────────────────────────────────────────────────────

export const getDocument = createServerFn({ method: "GET" })
  .validator(GetDocumentInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<DocumentView, DocumentNotFoundError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.documents
          .findFirst({
            where: and(
              eq(documents.projectId, data.projectId),
              eq(
                documents.type,
                data.type as (typeof documents.$inferSelect)["type"],
              ),
            ),
          })
          .then((row) => row ?? null),
        (e) => new DbError("getDocument", e),
      );

      if (result.isErr()) return toShape(err(result.error));
      if (!result.value) {
        return toShape(
          err(new DocumentNotFoundError(`${data.projectId}/${data.type}`)),
        );
      }

      return toShape(ok(stripYjsState(result.value)));
    },
  );

export const documentQueryOptions = (projectId: string, type: DocumentType) =>
  queryOptions({
    queryKey: ["documents", projectId, type] as const,
    queryFn: () => getDocument({ data: { projectId, type } }),
  });

// ─── Save document ────────────────────────────────────────────────────────────

export const saveDocument = createServerFn({ method: "POST" })
  .validator(SaveDocumentInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentView,
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      await requireUser();
      const db = await getDb();

      const docResult = await ResultAsync.fromPromise(
        db.query.documents
          .findFirst({ where: eq(documents.id, data.documentId) })
          .then((row) => row ?? null),
        (e) => new DbError("saveDocument.find", e),
      );
      if (docResult.isErr()) return toShape(err(docResult.error));
      const doc = docResult.value;
      if (!doc) return toShape(err(new DocumentNotFoundError(data.documentId)));

      const { projects: projectsTable } = await import("@oh-writers/db/schema");
      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projectsTable.id, doc.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("saveDocument.project", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const project = projectResult.value;
      if (!project)
        return toShape(err(new DocumentNotFoundError(data.documentId)));
      if (project.isArchived) {
        return toShape(
          err(new ForbiddenError("save document: project is archived")),
        );
      }

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(documents)
            .set({ content: data.content, updatedAt: new Date() })
            .where(eq(documents.id, data.documentId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("saveDocument", e),
        ).andThen((updated) =>
          updated
            ? ok(stripYjsState(updated))
            : err(new DocumentNotFoundError(data.documentId)),
        ),
      );
    },
  );
