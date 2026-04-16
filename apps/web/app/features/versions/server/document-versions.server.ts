import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, desc } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { documentVersions, documents } from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import {
  ListDocumentVersionsInput,
  GetDocumentVersionInput,
  CreateDocumentVersionInput,
  RenameDocumentVersionInput,
  DeleteDocumentVersionInput,
} from "../versions.schema";
import type { DocumentVersionView } from "../versions.schema";
import {
  VersionNotFoundError,
  ForbiddenError,
  DbError,
  InvalidLabelError,
} from "../versions.errors";

const toView = (
  row: typeof documentVersions.$inferSelect,
): DocumentVersionView => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

// ─── List ─────────────────────────────────────────────────────────────────────

export const listDocumentVersions = createServerFn({ method: "GET" })
  .validator(ListDocumentVersionsInput)
  .handler(
    async ({ data }): Promise<ResultShape<DocumentVersionView[], DbError>> => {
      await requireUser();
      const db = await getDb();

      return toShape(
        await ResultAsync.fromPromise(
          db.query.documentVersions
            .findMany({
              where: eq(documentVersions.documentId, data.documentId),
              orderBy: [desc(documentVersions.createdAt)],
            })
            .then((rows) => rows.map(toView)),
          (e) => new DbError("listDocumentVersions", e),
        ),
      );
    },
  );

export const documentVersionsQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["document-versions", documentId] as const,
    queryFn: () => listDocumentVersions({ data: { documentId } }),
  });

// ─── Get ──────────────────────────────────────────────────────────────────────

export const getDocumentVersion = createServerFn({ method: "GET" })
  .validator(GetDocumentVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<DocumentVersionView, VersionNotFoundError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.documentVersions
          .findFirst({ where: eq(documentVersions.id, data.versionId) })
          .then((row) => row ?? null),
        (e) => new DbError("getDocumentVersion", e),
      );

      if (result.isErr()) return toShape(err(result.error));
      if (!result.value)
        return toShape(err(new VersionNotFoundError(data.versionId)));

      return toShape(ok(toView(result.value)));
    },
  );

// ─── Create manual ────────────────────────────────────────────────────────────

export const createDocumentVersion = createServerFn({ method: "POST" })
  .validator(CreateDocumentVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersionView,
        VersionNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const docResult = await ResultAsync.fromPromise(
        db.query.documents
          .findFirst({ where: eq(documents.id, data.documentId) })
          .then((row) => row ?? null),
        (e) => new DbError("createDocumentVersion.find", e),
      );
      if (docResult.isErr()) return toShape(err(docResult.error));
      const doc = docResult.value;
      if (!doc) return toShape(err(new VersionNotFoundError(data.documentId)));

      return toShape(
        await ResultAsync.fromPromise(
          db
            .insert(documentVersions)
            .values({
              documentId: data.documentId,
              label: data.label ?? null,
              content: doc.content,
              createdBy: user.id,
            })
            .returning()
            .then((rows) => rows[0]),
          (e) => new DbError("createDocumentVersion", e),
        ).andThen((v) =>
          v ? ok(toView(v)) : err(new VersionNotFoundError("new")),
        ),
      );
    },
  );

// ─── Rename ───────────────────────────────────────────────────────────────────

export const renameDocumentVersion = createServerFn({ method: "POST" })
  .validator(RenameDocumentVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersionView,
        VersionNotFoundError | InvalidLabelError | DbError
      >
    > => {
      await requireUser();
      const db = await getDb();

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(documentVersions)
            .set({ label: data.label })
            .where(eq(documentVersions.id, data.versionId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("renameDocumentVersion", e),
        ).andThen((row) =>
          row ? ok(toView(row)) : err(new VersionNotFoundError(data.versionId)),
        ),
      );
    },
  );

// ─── Delete ───────────────────────────────────────────────────────────────────

export const deleteDocumentVersion = createServerFn({ method: "POST" })
  .validator(DeleteDocumentVersionInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<void, VersionNotFoundError | DbError>> => {
      await requireUser();
      const db = await getDb();

      return toShape(
        await ResultAsync.fromPromise(
          db
            .delete(documentVersions)
            .where(eq(documentVersions.id, data.versionId)),
          (e) => new DbError("deleteDocumentVersion", e),
        ).map(() => undefined),
      );
    },
  );
