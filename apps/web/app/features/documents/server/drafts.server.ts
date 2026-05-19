import { createServerFn } from "@tanstack/start";
import { ok, err, errAsync, ResultAsync } from "neverthrow";
import { eq, and, desc } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { documents, documentVersions } from "@oh-writers/db/schema";
import type { DocumentVersion } from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { canEdit, getMembership } from "~/server/permissions";
import { projects } from "@oh-writers/db/schema";
import {
  DocumentNotFoundError,
  ForbiddenError,
  DbError,
} from "../documents.errors";

// ─── Shared helpers ──────────────────────────────────────────────────────────

type DocumentRow = typeof documents.$inferSelect;

const findDocument = (db: Db, documentId: string) =>
  ResultAsync.fromPromise(
    db.query.documents
      .findFirst({ where: eq(documents.id, documentId) })
      .then((row) => row ?? null),
    (e) => new DbError("drafts.findDocument", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DocumentNotFoundError(documentId)),
  );

const findVersion = (db: Db, versionId: string) =>
  ResultAsync.fromPromise(
    db.query.documentVersions
      .findFirst({ where: eq(documentVersions.id, versionId) })
      .then((row) => row ?? null),
    (e) => new DbError("drafts.findVersion", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DocumentNotFoundError(versionId)),
  );

const assertCanEdit = (db: Db, doc: DocumentRow, userId: string) =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, doc.projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("drafts.project", e),
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
        : err(new ForbiddenError("mutate document draft")),
    );

const assertCanRead = (db: Db, doc: DocumentRow, userId: string) =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, doc.projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("drafts.project", e),
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
        : err(new ForbiddenError("read document drafts"));
    });

// ─── getDocumentDrafts ───────────────────────────────────────────────────────

export const GetDocumentDraftsInput = z.object({
  documentId: z.string().uuid(),
});

export const getDocumentDrafts = createServerFn({ method: "GET" })
  .validator(GetDocumentDraftsInput)
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
                where: and(
                  eq(documentVersions.documentId, doc.id),
                  eq(documentVersions.isDraft, true),
                ),
                orderBy: desc(documentVersions.createdAt),
              }),
              (e) => new DbError("drafts.list", e),
            ),
          ),
      );
    },
  );

export const documentDraftsQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["document-drafts", documentId] as const,
    queryFn: () => getDocumentDrafts({ data: { documentId } }),
  });

// ─── promoteDocumentDraft ────────────────────────────────────────────────────

export const PromoteDocumentDraftInput = z.object({
  versionId: z.string().uuid(),
});

export const promoteDocumentDraft = createServerFn({ method: "POST" })
  .validator(PromoteDocumentDraftInput)
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
        await findVersion(db, data.versionId).andThen((version) =>
          findDocument(db, version.documentId)
            .andThen((doc) => assertCanEdit(db, doc, user.id).map(() => doc))
            .andThen((doc) =>
              ResultAsync.fromPromise(
                db.transaction(async (tx) => {
                  const [promoted] = await tx
                    .update(documentVersions)
                    .set({
                      isDraft: false,
                      updatedAt: new Date(),
                    })
                    .where(eq(documentVersions.id, version.id))
                    .returning();
                  if (!promoted) throw new Error("Promote returned no rows");
                  await tx
                    .update(documents)
                    .set({
                      currentVersionId: promoted.id,
                      content: promoted.content,
                      updatedAt: new Date(),
                    })
                    .where(eq(documents.id, doc.id));
                  return promoted;
                }),
                (e) => new DbError("drafts.promote", e),
              ),
            ),
        ),
      );
    },
  );

// ─── discardDocumentDraft ────────────────────────────────────────────────────

export const DiscardDocumentDraftInput = z.object({
  versionId: z.string().uuid(),
});

export const discardDocumentDraft = createServerFn({ method: "POST" })
  .validator(DiscardDocumentDraftInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { ok: true; versionId: string },
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findDocument(db, version.documentId).map((doc) => ({
              doc,
              version,
            })),
          )
          .andThen(({ doc, version }) =>
            assertCanEdit(db, doc, user.id).map(() => version),
          )
          .andThen((version) => {
            if (!version.isDraft) {
              return errAsync(
                new ForbiddenError(
                  "discard non-draft version (use deleteVersion instead)",
                ),
              );
            }
            return ResultAsync.fromPromise(
              db
                .delete(documentVersions)
                .where(eq(documentVersions.id, version.id))
                .then(() => ({ ok: true as const, versionId: version.id })),
              (e) => new DbError("drafts.discard", e),
            );
          }),
      );
    },
  );
