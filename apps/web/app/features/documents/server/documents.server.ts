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
import { getDb } from "~/server/db";
import { stripYjsState } from "~/server/helpers";
import { canEdit, getMembership } from "~/server/permissions";
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

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projects.id, data.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("getDocument.project", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const project = projectResult.value;
      if (!project) {
        return toShape(
          err(new DocumentNotFoundError(`${data.projectId}/${data.type}`)),
        );
      }

      const membershipResult = project.teamId
        ? await getMembership(db, project.teamId, user.id)
        : ok(null);
      if (membershipResult.isErr()) return toShape(err(membershipResult.error));

      const permission = canEdit(project, user.id, membershipResult.value);

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

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projects.id, doc.projectId) })
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

      // Role guard — viewers (and non-members on team projects) cannot save.
      const membershipResult = project.teamId
        ? await getMembership(db, project.teamId, user.id)
        : ok(null);
      if (membershipResult.isErr()) return toShape(err(membershipResult.error));
      if (!canEdit(project, user.id, membershipResult.value)) {
        return toShape(
          err(new ForbiddenError("save document: insufficient role")),
        );
      }

      // Write to the active version row (Spec 06b). documents.updatedAt is
      // bumped so list views sort freshly; documents.content is left stale
      // on purpose — the version row is the source of truth.
      if (doc.currentVersionId) {
        return toShape(
          await ResultAsync.fromPromise(
            db
              .update(documentVersions)
              .set({ content: data.content, updatedAt: new Date() })
              .where(eq(documentVersions.id, doc.currentVersionId))
              .then(() =>
                db
                  .update(documents)
                  .set({ updatedAt: new Date() })
                  .where(eq(documents.id, data.documentId))
                  .returning()
                  .then((rows) => rows[0] ?? null),
              ),
            (e) => new DbError("saveDocument.version", e),
          ).andThen((updated) =>
            updated
              ? ok({ ...stripYjsState(updated), content: data.content })
              : err(new DocumentNotFoundError(data.documentId)),
          ),
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

// ─── Export narrative PDF ─────────────────────────────────────────────────────

export const ExportNarrativePdfInput = z.object({
  projectId: z.string().uuid(),
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
      const user = await requireUser();
      const db = await getDb();

      const projectResult = await ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projects.id, data.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("exportNarrativePdf.project", e),
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const project = projectResult.value;
      if (!project)
        return toShape(err(new ProjectNotFoundError(data.projectId)));

      // Read-permission: personal owner, or any team member (viewer included).
      const membershipResult = project.teamId
        ? await getMembership(db, project.teamId, user.id)
        : ok(null);
      if (membershipResult.isErr()) return toShape(err(membershipResult.error));
      const membership = membershipResult.value;
      const isPersonalOwner =
        project.teamId === null && project.ownerId === user.id;
      const canRead = isPersonalOwner || membership !== null;
      if (!canRead) {
        return toShape(
          err(new ForbiddenError("export narrative: not a project member")),
        );
      }

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
