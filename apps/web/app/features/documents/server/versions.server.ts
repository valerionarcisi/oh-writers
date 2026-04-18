import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, and, desc, sql } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { documents, documentVersions, projects } from "@oh-writers/db/schema";
import type { DocumentVersion } from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { canEdit, getMembership } from "~/server/permissions";
import {
  DocumentNotFoundError,
  ForbiddenError,
  ValidationError,
  DbError,
} from "../documents.errors";

// ─── Shared guards ────────────────────────────────────────────────────────────

type DocumentRow = typeof documents.$inferSelect;

const findDocument = (db: Db, documentId: string) =>
  ResultAsync.fromPromise(
    db.query.documents
      .findFirst({ where: eq(documents.id, documentId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.findDocument", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DocumentNotFoundError(documentId)),
  );

const findVersion = (db: Db, versionId: string) =>
  ResultAsync.fromPromise(
    db.query.documentVersions
      .findFirst({ where: eq(documentVersions.id, versionId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.findVersion", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DocumentNotFoundError(versionId)),
  );

const assertCanEdit = (db: Db, doc: DocumentRow, userId: string) =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, doc.projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.project", e),
  )
    .andThen((project) =>
      project ? ok(project) : err(new DocumentNotFoundError(doc.projectId)),
    )
    .andThen((project) =>
      (project.teamId
        ? getMembership(db, project.teamId, userId)
        : ResultAsync.fromSafePromise(Promise.resolve(null))
      ).map((membership) => ({ project, membership })),
    )
    .andThen(({ project, membership }) =>
      canEdit(project, userId, membership)
        ? ok(null)
        : err(new ForbiddenError("mutate document version")),
    );

const assertCanRead = (db: Db, doc: DocumentRow, userId: string) =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, doc.projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.project", e),
  )
    .andThen((project) =>
      project ? ok(project) : err(new DocumentNotFoundError(doc.projectId)),
    )
    .andThen((project) =>
      (project.teamId
        ? getMembership(db, project.teamId, userId)
        : ResultAsync.fromSafePromise(Promise.resolve(null))
      ).map((membership) => ({ project, membership })),
    )
    .andThen(({ project, membership }) => {
      const isPersonalOwner =
        project.teamId === null && project.ownerId === userId;
      const canRead = isPersonalOwner || membership !== null;
      return canRead
        ? ok(null)
        : err(new ForbiddenError("read document versions"));
    });

const nextNumber = (db: Db, documentId: string) =>
  ResultAsync.fromPromise(
    db
      .select({
        max: sql<number>`coalesce(max(${documentVersions.number}), 0)`,
      })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .then((rows) => (rows[0]?.max ?? 0) + 1),
    (e) => new DbError("versions.nextNumber", e),
  );

// ─── listVersions ─────────────────────────────────────────────────────────────

export const ListVersionsInput = z.object({
  documentId: z.string().uuid(),
});

export const listVersions = createServerFn({ method: "GET" })
  .validator(ListVersionsInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        readonly DocumentVersion[],
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findDocument(db, data.documentId)
          .andThen((doc) => assertCanRead(db, doc, user.id).map(() => doc))
          .andThen((doc) =>
            ResultAsync.fromPromise(
              db.query.documentVersions.findMany({
                where: eq(documentVersions.documentId, doc.id),
                orderBy: desc(documentVersions.number),
              }),
              (e) => new DbError("versions.list", e),
            ),
          ),
      );
    },
  );

export const versionsQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["document-versions", documentId] as const,
    queryFn: () => listVersions({ data: { documentId } }),
  });

// ─── createVersionFromScratch ─────────────────────────────────────────────────

export const CreateVersionInput = z.object({
  documentId: z.string().uuid(),
});

export const createVersionFromScratch = createServerFn({ method: "POST" })
  .validator(CreateVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersion,
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findDocument(db, data.documentId)
          .andThen((doc) => assertCanEdit(db, doc, user.id).map(() => doc))
          .andThen((doc) =>
            nextNumber(db, doc.id).map((number) => ({ doc, number })),
          )
          .andThen(({ doc, number }) =>
            ResultAsync.fromPromise(
              db
                .insert(documentVersions)
                .values({
                  documentId: doc.id,
                  number,
                  content: "",
                  createdBy: user.id,
                })
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.create", e),
            ).andThen((version) =>
              version
                ? ResultAsync.fromPromise(
                    db
                      .update(documents)
                      .set({ currentVersionId: version.id })
                      .where(eq(documents.id, doc.id))
                      .then(() => version),
                    (e) => new DbError("versions.create.update-current", e),
                  )
                : err(new DbError("versions.create", "no row returned")),
            ),
          ),
      );
    },
  );

// ─── duplicateVersion ─────────────────────────────────────────────────────────

export const DuplicateVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const duplicateVersion = createServerFn({ method: "POST" })
  .validator(DuplicateVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersion,
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((source) =>
            findDocument(db, source.documentId).map((doc) => ({
              source,
              doc,
            })),
          )
          .andThen(({ source, doc }) =>
            assertCanEdit(db, doc, user.id).map(() => ({ source, doc })),
          )
          .andThen(({ source, doc }) =>
            nextNumber(db, doc.id).map((number) => ({ source, doc, number })),
          )
          .andThen(({ source, doc, number }) =>
            ResultAsync.fromPromise(
              db
                .insert(documentVersions)
                .values({
                  documentId: doc.id,
                  number,
                  content: source.content,
                  createdBy: user.id,
                })
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.duplicate", e),
            ).andThen((version) =>
              version
                ? ResultAsync.fromPromise(
                    db
                      .update(documents)
                      .set({ currentVersionId: version.id })
                      .where(eq(documents.id, doc.id))
                      .then(() => version),
                    (e) => new DbError("versions.duplicate.update-current", e),
                  )
                : err(new DbError("versions.duplicate", "no row returned")),
            ),
          ),
      );
    },
  );

// ─── renameVersion ────────────────────────────────────────────────────────────

export const RenameVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().max(80).nullable(),
});

export const renameVersion = createServerFn({ method: "POST" })
  .validator(RenameVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersion,
        DocumentNotFoundError | ForbiddenError | ValidationError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findDocument(db, version.documentId).map((doc) => ({
              version,
              doc,
            })),
          )
          .andThen(({ doc, version }) =>
            assertCanEdit(db, doc, user.id).map(() => version),
          )
          .andThen((version) =>
            ResultAsync.fromPromise(
              db
                .update(documentVersions)
                .set({ label: data.label, updatedAt: new Date() })
                .where(eq(documentVersions.id, version.id))
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.rename", e),
            ).andThen((row) =>
              row ? ok(row) : err(new DocumentNotFoundError(version.id)),
            ),
          ),
      );
    },
  );

// ─── switchToVersion ──────────────────────────────────────────────────────────

export const SwitchVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const switchToVersion = createServerFn({ method: "POST" })
  .validator(SwitchVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersion,
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findDocument(db, version.documentId).map((doc) => ({
              version,
              doc,
            })),
          )
          .andThen(({ version, doc }) =>
            // currentVersionId is global on the document row — switching it
            // changes what every collaborator sees. Must be edit-gated, not
            // read-gated, otherwise viewers can mutate shared state.
            assertCanEdit(db, doc, user.id).map(() => ({ version, doc })),
          )
          .andThen(({ version, doc }) =>
            ResultAsync.fromPromise(
              db
                .update(documents)
                .set({ currentVersionId: version.id })
                .where(eq(documents.id, doc.id))
                .then(() => version),
              (e) => new DbError("versions.switch", e),
            ),
          ),
      );
    },
  );

// ─── deleteVersion ────────────────────────────────────────────────────────────

export const DeleteVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const deleteVersion = createServerFn({ method: "POST" })
  .validator(DeleteVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string },
        DocumentNotFoundError | ForbiddenError | ValidationError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findDocument(db, version.documentId).map((doc) => ({
              version,
              doc,
            })),
          )
          .andThen(({ version, doc }) =>
            assertCanEdit(db, doc, user.id).map(() => ({ version, doc })),
          )
          .andThen(({ version, doc }) => {
            if (doc.currentVersionId === version.id) {
              return err(
                new ValidationError(
                  "versionId",
                  "cannot delete the current version — switch first",
                ),
              );
            }
            return ResultAsync.fromPromise(
              db
                .select({ count: sql<number>`count(*)::int` })
                .from(documentVersions)
                .where(eq(documentVersions.documentId, doc.id))
                .then((rows) => rows[0]?.count ?? 0),
              (e) => new DbError("versions.delete.count", e),
            ).andThen((count) =>
              count <= 1
                ? err(
                    new ValidationError(
                      "versionId",
                      "cannot delete the only version",
                    ),
                  )
                : ok(version),
            );
          })
          .andThen((version) =>
            ResultAsync.fromPromise(
              db
                .delete(documentVersions)
                .where(eq(documentVersions.id, version.id))
                .then(() => ({ id: version.id })),
              (e) => new DbError("versions.delete", e),
            ),
          ),
      );
    },
  );

// ─── saveVersionContent ───────────────────────────────────────────────────────

export const SaveVersionContentInput = z.object({
  versionId: z.string().uuid(),
  content: z.string(),
});

export const saveVersionContent = createServerFn({ method: "POST" })
  .validator(SaveVersionContentInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        DocumentVersion,
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findDocument(db, version.documentId).map((doc) => ({
              version,
              doc,
            })),
          )
          .andThen(({ version, doc }) =>
            assertCanEdit(db, doc, user.id).map(() => version),
          )
          .andThen((version) =>
            ResultAsync.fromPromise(
              db
                .update(documentVersions)
                .set({ content: data.content, updatedAt: new Date() })
                .where(eq(documentVersions.id, version.id))
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.saveContent", e),
            ).andThen((row) =>
              row ? ok(row) : err(new DocumentNotFoundError(version.id)),
            ),
          ),
      );
    },
  );
