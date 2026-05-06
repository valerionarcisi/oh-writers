import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  TextRun,
} from "docx";
import { documents, documentVersions, users } from "@oh-writers/db/schema";
import { DocumentTypes } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import {
  DbError,
  ForbiddenError,
  SubjectNotFoundError,
} from "../documents.errors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const slug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "soggetto";

export type ParsedBlock =
  | { readonly kind: "heading"; readonly level: 2; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string };

const stripHtml = (html: string): string => {
  if (!html.includes("<")) return html;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|h[1-6]|li|div|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
};

const stripInlineMarkdown = (text: string): string =>
  text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/~~(.+?)~~/gs, "$1");

/**
 * Minimal parser for soggetto export. Handles both HTML (ProseMirror output)
 * and plain markdown. `## heading` lines become heading blocks, blank lines
 * break paragraphs.
 */
export const parseSoggettoMarkdown = (content: string): ParsedBlock[] => {
  const plain = stripHtml(content);
  const trimmed = plain.trim();
  if (trimmed.length === 0) return [];
  return trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block): ParsedBlock => {
      if (/^#{1,6}\s+/.test(block)) {
        return {
          kind: "heading",
          level: 2,
          text: stripInlineMarkdown(block.replace(/^#{1,6}\s+/, "").trim()),
        };
      }
      return { kind: "paragraph", text: stripInlineMarkdown(block) };
    });
};

interface ProjectForDocx {
  readonly title: string;
  readonly ownerName: string | null;
}

export const buildSoggettoDocxSections = (
  parsed: ParsedBlock[],
  project: ProjectForDocx,
): Paragraph[] => {
  const titlePage: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 400 },
      children: [new TextRun({ text: project.title, bold: true, size: 48 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: "Soggetto", italics: true, size: 28 })],
    }),
  ];
  if (project.ownerName && project.ownerName.trim().length > 0) {
    titlePage.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 1200 },
        children: [new TextRun({ text: project.ownerName, size: 24 })],
      }),
    );
  }
  const body = parsed.map((block) =>
    block.kind === "heading"
      ? new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
          children: [new TextRun({ text: block.text, bold: true })],
        })
      : new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: block.text })],
        }),
  );
  return [...titlePage, ...body];
};

// ─── Data loading ─────────────────────────────────────────────────────────────

interface LoadedProject {
  readonly id: string;
  readonly title: string;
  readonly teamId: string | null;
  readonly ownerId: string | null;
  readonly ownerName: string | null;
  readonly isArchived: boolean;
}

type DocxAccessError = SubjectNotFoundError | ForbiddenError | DbError;

const requireDocxExportAccess = (
  db: Db,
  projectId: string,
): ResultAsync<LoadedProject, DocxAccessError> =>
  requireProjectAccess(db, projectId, "edit")
    .mapErr(
      (e): DocxAccessError =>
        e._tag === "ProjectNotFoundError"
          ? new SubjectNotFoundError(projectId)
          : e,
    )
    .andThen(({ project }) =>
      ResultAsync.fromPromise(
        (async () => {
          let ownerName: string | null = null;
          if (project.ownerId) {
            const owner = await db.query.users.findFirst({
              where: eq(users.id, project.ownerId),
            });
            ownerName = owner?.name ?? null;
          }
          return {
            id: project.id,
            title: project.title,
            teamId: project.teamId,
            ownerId: project.ownerId,
            ownerName,
            isArchived: project.isArchived,
          } satisfies LoadedProject;
        })(),
        (e): DocxAccessError => new DbError("subject-export-docx/owner", e),
      ),
    );

// Duplicated from subject-ai.server.ts to keep this module self-contained.
// A follow-up task should DRY this into a shared loader in the documents
// feature (see chip-task "DRY loadCurrentSoggetto").
const loadCurrentSoggetto = (
  db: Db,
  projectId: string,
): ResultAsync<string | null, DbError> =>
  ResultAsync.fromPromise(
    (async (): Promise<string | null> => {
      const doc = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, projectId),
          eq(documents.type, DocumentTypes.SOGGETTO),
        ),
      });
      if (!doc) return null;
      if (doc.currentVersionId) {
        const version = await db.query.documentVersions.findFirst({
          where: eq(documentVersions.id, doc.currentVersionId),
        });
        if (version && version.content.length > 0) return version.content;
      }
      const latest = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, doc.id))
        .orderBy(desc(documentVersions.createdAt))
        .limit(1);
      const latestContent = latest[0]?.content;
      if (latestContent && latestContent.length > 0) return latestContent;
      return doc.content.length > 0 ? doc.content : null;
    })(),
    (e) => new DbError("subject-export-docx/loadSoggetto", e),
  );

// ─── Public contract ──────────────────────────────────────────────────────────

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

type ExportError = SubjectNotFoundError | ForbiddenError | DbError;
type ExportPayload = {
  readonly base64: string;
  readonly filename: string;
  readonly mimeType: typeof DOCX_MIME;
};

export const exportSubjectDocx = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<ExportPayload, ExportError>> => {
      const db = await getDb();

      const chain = await requireDocxExportAccess(db, data.projectId)
        .andThen((project) =>
          loadCurrentSoggetto(db, project.id).map(
            (soggetto) => ({ project, soggetto }) as const,
          ),
        )
        .andThen(({ project, soggetto }) => {
          const parsed = parseSoggettoMarkdown(soggetto ?? "");
          const sections = buildSoggettoDocxSections(parsed, {
            title: project.title,
            ownerName: project.ownerName,
          });
          const doc = new Document({
            sections: [{ properties: {}, children: sections }],
          });
          return ResultAsync.fromPromise(
            Packer.toBuffer(doc).then((buf) =>
              Buffer.from(buf).toString("base64"),
            ),
            (e): ExportError => new DbError("docx:pack", e),
          ).map(
            (base64): ExportPayload => ({
              base64,
              filename: `${slug(project.title)}-soggetto.docx`,
              mimeType: DOCX_MIME,
            }),
          );
        });

      return toShape(chain);
    },
  );
