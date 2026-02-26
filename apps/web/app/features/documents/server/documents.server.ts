import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import type { Result } from "neverthrow";
import { eq, and } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { documents } from "@oh-writers/db/schema";
import type { Document } from "@oh-writers/db";
import type { DocumentType } from "@oh-writers/shared";
import { getUser } from "~/server/context";
import { SaveDocumentInput, GetDocumentInput } from "../documents.schema";
import {
  DocumentNotFoundError,
  ForbiddenError,
  DbError,
} from "../documents.errors";

// ─── Serializable result shape ────────────────────────────────────────────────
// createServerFn requires JSON-serializable return types. Neverthrow's Result
// has methods (isOk(), map(), etc.) which fail that check. We convert at the
// server function boundary to a plain discriminated union that survives JSON.

export type OkShape<T> = { readonly isOk: true; readonly value: T };
export type ErrShape<E> = { readonly isOk: false; readonly error: E };
export type ResultShape<T, E> = OkShape<T> | ErrShape<E>;

const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> =>
  result.isOk()
    ? { isOk: true as const, value: result.value }
    : { isOk: false as const, error: result.error };

// ─── Types ────────────────────────────────────────────────────────────────────

// yjsState is a binary Buffer (bytea column) — strip it before sending to client.
export type DocumentView = Omit<Document, "yjsState">;

const stripYjsState = <T extends { yjsState?: unknown }>({
  yjsState: _,
  ...rest
}: T): Omit<T, "yjsState"> => rest as Omit<T, "yjsState">;

// ─── Auth helper ──────────────────────────────────────────────────────────────

const requireUser = async () => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};

// ─── DB helper ────────────────────────────────────────────────────────────────

const getDb = async () => {
  const { db } = await import("@oh-writers/db");
  return db;
};

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

      // Permission: check the parent project is not archived
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
