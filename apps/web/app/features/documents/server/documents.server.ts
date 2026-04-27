import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, and } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { documents, documentVersions, projects } from "@oh-writers/db/schema";
import type { Document } from "@oh-writers/db";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { stripYjsState } from "~/server/helpers";
import { canEdit } from "~/server/permissions";
import { requireProjectAccess } from "~/server/access";
import {
  SaveDocumentInput,
  GetDocumentInput,
  ContentMaxByType,
} from "../documents.schema";
import {
  DocumentNotFoundError,
  ForbiddenError,
  ValidationError,
  DbError,
} from "../documents.errors";
import { ProjectNotFoundError } from "../../projects/projects.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentView = Omit<Document, "yjsState">;

export type DocumentViewWithPermission = DocumentView & {
  canEdit: boolean;
};

// ─── ensureFirstDocumentVersion ──────────────────────────────────────────────
//
// Narrative documents (logline / synopsis / outline / treatment) are created
// without an implicit version row. The Versions popover would otherwise show
// "Nessuna versione salvata" until the user manually clicks "Nuova versione".
// Mirroring the screenplay pattern, the first read or save snapshots the
// current content into document_versions.number = 1 / label = "Versione 1" and
// points documents.current_version_id at it.
type TxOrDb = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

async function ensureFirstDocumentVersion(
  tx: TxOrDb,
  documentId: string,
  userId: string,
): Promise<string | null> {
  const [doc] = await tx
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return null;
  if (doc.currentVersionId) return doc.currentVersionId;

  const [version] = await tx
    .insert(documentVersions)
    .values({
      documentId: doc.id,
      number: 1,
      label: "Versione 1",
      content: doc.content,
      createdBy: userId,
    })
    .returning();
  if (!version) return null;

  await tx
    .update(documents)
    .set({ currentVersionId: version.id })
    .where(eq(documents.id, doc.id));

  return version.id;
}

// ─── Get document ─────────────────────────────────────────────────────────────

export const getDocument = createServerFn({ method: "GET" })
  .validator(GetDocumentInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<DocumentViewWithPermission, DocumentNotFoundError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.transaction(async (tx) => {
          const existing = await tx.query.documents
            .findFirst({
              where: and(
                eq(documents.projectId, data.projectId),
                eq(
                  documents.type,
                  data.type as (typeof documents.$inferSelect)["type"],
                ),
              ),
            })
            .then((row) => row ?? null);
          if (!existing) return null;
          if (!existing.currentVersionId) {
            const versionId = await ensureFirstDocumentVersion(
              tx,
              existing.id,
              user.id,
            );
            if (versionId) {
              return { ...existing, currentVersionId: versionId };
            }
          }
          return existing;
        }),
        (e) => new DbError("getDocument", e),
      );

      if (result.isErr()) return toShape(err(result.error));
      if (!result.value) {
        return toShape(
          err(new DocumentNotFoundError(`${data.projectId}/${data.type}`)),
        );
      }

      // Content lives on the active version row (Spec 06b). documents.content
      // is retained as legacy fallback for rows the migration hasn't touched.
      let liveContent = result.value.content;
      if (result.value.currentVersionId) {
        const versionResult = await ResultAsync.fromPromise(
          db.query.documentVersions
            .findFirst({
              where: eq(documentVersions.id, result.value.currentVersionId),
            })
            .then((row) => row ?? null),
          (e) => new DbError("getDocument.version", e),
        );
        if (versionResult.isErr()) return toShape(err(versionResult.error));
        if (versionResult.value) liveContent = versionResult.value.content;
      }

      const accessResult = await requireProjectAccess(
        db,
        data.projectId,
        "view",
      );
      if (accessResult.isErr()) {
        // Map ProjectNotFound back to DocumentNotFound to keep the public
        // contract: GETs by (projectId, type) report missing-document either
        // way (project absence ⇒ document is unreachable for this caller).
        const e = accessResult.error;
        if (e._tag === "ProjectNotFoundError") {
          return toShape(
            err(new DocumentNotFoundError(`${data.projectId}/${data.type}`)),
          );
        }
        if (e._tag === "ForbiddenError") {
          return toShape(
            err(new DocumentNotFoundError(`${data.projectId}/${data.type}`)),
          );
        }
        return toShape(err(e));
      }
      const { project, membership } = accessResult.value;
      const permission = canEdit(project, user.id, membership);

      return toShape(
        ok({
          ...stripYjsState(result.value),
          content: liveContent,
          canEdit: permission,
        }),
      );
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
        DocumentNotFoundError | ForbiddenError | ValidationError | DbError
      >
    > => {
      const user = await requireUser();
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

      // Per-type content cap — Zod accepts any string on the wire, but each
      // document type has a domain-level maximum enforced here so clients
      // that bypass the textarea maxLength still get rejected.
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

      // Write to the active version row (Spec 06b). documents.updatedAt is
      // bumped so list views sort freshly; documents.content is mirrored so
      // legacy readers that skip the version lookup still see fresh text.
      // If the document has no current version yet (first save on a freshly
      // created doc), snapshot a "Versione 1" row first so the Versions
      // popover is never empty.
      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            let activeVersionId = doc.currentVersionId;
            if (!activeVersionId) {
              activeVersionId = await ensureFirstDocumentVersion(
                tx,
                doc.id,
                user.id,
              );
            }
            if (activeVersionId) {
              await tx
                .update(documentVersions)
                .set({ content: data.content, updatedAt: new Date() })
                .where(eq(documentVersions.id, activeVersionId));
            }
            const [updated] = await tx
              .update(documents)
              .set({ content: data.content, updatedAt: new Date() })
              .where(eq(documents.id, data.documentId))
              .returning();
            if (!updated) throw new Error("Save returned no rows");
            return updated;
          }),
          (e) => new DbError("saveDocument", e),
        ).andThen((updated) =>
          ok({ ...stripYjsState(updated), content: data.content }),
        ),
      );
    },
  );

// ─── Export narrative PDF ─────────────────────────────────────────────────────

export const ExportNarrativePdfInput = z.object({
  projectId: z.string().uuid(),
  includeTitlePage: z.boolean().default(false),
});

export const exportNarrativePdf = createServerFn({ method: "POST" })
  .validator(ExportNarrativePdfInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > => {
      const db = await getDb();

      const accessResult = await requireProjectAccess(
        db,
        data.projectId,
        "view",
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      const { project } = accessResult.value;

      const docsResult = await ResultAsync.fromPromise(
        db.query.documents.findMany({
          where: eq(documents.projectId, data.projectId),
        }),
        (e) => new DbError("exportNarrativePdf.documents", e),
      );
      if (docsResult.isErr()) return toShape(err(docsResult.error));
      // Resolve each document's live content via its active version row.
      // Falls back to documents.content for the unlikely case of a row
      // whose current_version_id never got backfilled.
      const versionIds = docsResult.value
        .map((d) => d.currentVersionId)
        .filter((v): v is string => v !== null);
      const versionsResult = versionIds.length
        ? await ResultAsync.fromPromise(
            db.query.documentVersions.findMany({
              where: (v, { inArray }) => inArray(v.id, versionIds),
            }),
            (e) => new DbError("exportNarrativePdf.versions", e),
          )
        : ok([] as { id: string; content: string }[]);
      if (versionsResult.isErr()) return toShape(err(versionsResult.error));
      const versionById = new Map(
        versionsResult.value.map((v) => [v.id, v.content] as const),
      );
      const byType = new Map<DocumentType, string>();
      for (const d of docsResult.value) {
        const content = d.currentVersionId
          ? (versionById.get(d.currentVersionId) ?? d.content)
          : d.content;
        byType.set(d.type as DocumentType, content);
      }

      // Dynamic import keeps pdfkit out of the client bundle — its transitive
      // deps (base64-js, fs, zlib) are CJS/Node-only and break Vite SSR graph.
      const { buildNarrativePdf, buildNarrativeFilename } =
        await import("../lib/pdf-narrative");

      const buffer = await buildNarrativePdf({
        projectTitle: project.title,
        author: project.titlePageAuthor,
        draftDate: project.titlePageDraftDate,
        includeCoverPage: data.includeTitlePage,
        logline: byType.get(DocumentTypes.LOGLINE) ?? "",
        synopsis: byType.get(DocumentTypes.SYNOPSIS) ?? "",
        treatment: byType.get(DocumentTypes.TREATMENT) ?? "",
      });

      return toShape(
        ok({
          pdfBase64: buffer.toString("base64"),
          filename: buildNarrativeFilename(project.title),
        }),
      );
    },
  );
