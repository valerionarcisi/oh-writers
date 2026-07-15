import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, and, desc, sql } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { documents, documentVersions, projects } from "@oh-writers/db/schema";
import type { DocumentVersion } from "@oh-writers/db/schema";
import { DRAFT_REVISION_COLORS } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { canEdit, getMembership } from "~/server/permissions";
import { requireProjectAccess } from "~/server/access";
import { ContentMaxByType } from "../documents.schema";
import {
  DocumentNotFoundError,
  ForbiddenError,
  ValidationError,
  DbError,
} from "../documents.errors";
import {
  isPmRoomDocType,
  yjsStateFromNarrativeContent,
} from "./yjs-seed.server";
import { notifyRoomReseed } from "~/features/realtime/server/notify-room-reseed";

// ─── Shared guards ────────────────────────────────────────────────────────────

type DocumentRow = typeof documents.$inferSelect;

// Activating a version points `documents` at it and mirrors the version's
// content. For PM-room doc types the realtime editor reads the CRDT, not
// `content`, so the Yjs state is reseeded from the activated content too —
// otherwise "Attiva" leaves the open/reloaded editor on the previous version's
// text (BUG-N72, the narrative twin of the screenplay BUG-N71 reseed). A null
// reseed (empty/HTML content) leaves the existing CRDT untouched rather than
// wiping the room — the same guard the seed path uses.
export const activateVersionSet = (
  doc: DocumentRow,
  version: DocumentVersion,
) => {
  const reseed = isPmRoomDocType(doc.type)
    ? yjsStateFromNarrativeContent(version.content)
    : null;
  return {
    currentVersionId: version.id,
    content: version.content,
    ...(reseed ? { yjsState: reseed } : {}),
    updatedAt: new Date(),
  };
};

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

type TxOrDb = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

const nextNumber = (db: TxOrDb, documentId: string) =>
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

// The document's LIVE current (active) version id. The Versions surface reads
// this (not the static `?vcur=` URL hint) so the "current" badge moves the
// instant Attiva switches it. Shares the `["documents", ...]` key family so a
// switch invalidation refreshes it.
export const getCurrentVersionId = createServerFn({ method: "GET" })
  .validator(ListVersionsInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        string | null,
        DocumentNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findDocument(db, data.documentId)
          .andThen((doc) => assertCanRead(db, doc, user.id).map(() => doc))
          .map((doc) => doc.currentVersionId),
      );
    },
  );

export const currentVersionQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["documents", "current-version", documentId] as const,
    queryFn: () => getCurrentVersionId({ data: { documentId } }),
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
                      // Blank version: mirror the empty content AND clear the
                      // CRDT so the realtime editor renders blank instead of the
                      // previous version's text (BUG-N72). A NULL yjs_state makes
                      // the room reseed empty — correct for a deliberately blank
                      // version, the one case where an empty CRDT is wanted.
                      .set({
                        currentVersionId: version.id,
                        content: "",
                        yjsState: null,
                        updatedAt: new Date(),
                      })
                      .where(eq(documents.id, doc.id))
                      .then(() => {
                        // Cleared the CRDT to blank — drop the live room so
                        // editors reload empty (BUG-N72).
                        if (isPmRoomDocType(doc.type))
                          void notifyRoomReseed(doc.id);
                        return version;
                      }),
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
                      .set(activateVersionSet(doc, version))
                      .where(eq(documents.id, doc.id))
                      .then(() => {
                        if (isPmRoomDocType(doc.type))
                          void notifyRoomReseed(doc.id);
                        return version;
                      }),
                    (e) => new DbError("versions.duplicate.update-current", e),
                  )
                : err(new DbError("versions.duplicate", "no row returned")),
            ),
          ),
      );
    },
  );

// ─── importNarrativeVersion ────────────────────────────────────────────────────

export const ImportNarrativeVersionInput = z.object({
  documentId: z.string().uuid(),
  content: z.string(),
  sourceFileName: z.string().max(255),
});

export const importNarrativeVersion = createServerFn({ method: "POST" })
  .validator(ImportNarrativeVersionInput)
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

      const docResult = await findDocument(db, data.documentId);
      if (docResult.isErr()) return toShape(err(docResult.error));
      const doc = docResult.value;

      const accessResult = await requireProjectAccess(
        db,
        doc.projectId,
        "edit",
      );
      if (accessResult.isErr()) {
        const e = accessResult.error;
        if (e._tag === "ProjectNotFoundError")
          return toShape(err(new DocumentNotFoundError(data.documentId)));
        return toShape(err(e));
      }

      const maxLength = ContentMaxByType[doc.type];
      if (data.content.length > maxLength) {
        return toShape(
          err(
            new ValidationError(
              "content",
              `exceeds ${doc.type} limit of ${maxLength} characters`,
            ),
          ),
        );
      }

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const numberResult = await nextNumber(tx, doc.id);
            if (numberResult.isErr()) throw numberResult.error;
            const [version] = await tx
              .insert(documentVersions)
              .values({
                documentId: doc.id,
                number: numberResult.value,
                content: data.content,
                label: `Importato da ${data.sourceFileName}`,
                createdBy: user.id,
              })
              .returning();
            if (!version) throw new Error("Import returned no rows");
            await tx
              .update(documents)
              .set(activateVersionSet(doc, version))
              .where(eq(documents.id, doc.id));
            return version;
          }),
          (e) => new DbError("versions.import", e),
        ).map((version) => {
          if (isPmRoomDocType(doc.type)) void notifyRoomReseed(doc.id);
          return version;
        }),
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
                .set(activateVersionSet(doc, version))
                .where(eq(documents.id, doc.id))
                .then(() => {
                  // Reseeded the CRDT — drop the live room so editors reload it
                  // instead of keeping the previous version's text (BUG-N72).
                  if (isPmRoomDocType(doc.type)) void notifyRoomReseed(doc.id);
                  return version;
                }),
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

// ─── updateVersionMeta ────────────────────────────────────────────────────────
// Set the per-version draft colour dot and/or draft date (Spec 66). Both fields
// are optional patches: an absent field is left untouched; `null` clears it.

const DraftColorEnum = z.enum(
  DRAFT_REVISION_COLORS as unknown as [string, ...string[]],
);

export const UpdateVersionMetaInput = z.object({
  versionId: z.string().uuid(),
  draftColor: DraftColorEnum.nullable().optional(),
  draftDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
});

export const updateVersionMeta = createServerFn({ method: "POST" })
  .validator(UpdateVersionMetaInput)
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

      const patch: Partial<Pick<DocumentVersion, "draftColor" | "draftDate">> =
        {};
      if (data.draftColor !== undefined) patch.draftColor = data.draftColor;
      if (data.draftDate !== undefined) patch.draftDate = data.draftDate;

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
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(documentVersions.id, version.id))
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.updateMeta", e),
            ).andThen((row) =>
              row ? ok(row) : err(new DocumentNotFoundError(version.id)),
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
