import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { eq, and } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { documents, projects } from "@oh-writers/db/schema";
import type { Document } from "@oh-writers/db";
import type { DocumentType } from "@oh-writers/domain";
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
        ok({ ...stripYjsState(result.value), canEdit: permission }),
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
