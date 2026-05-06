import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { and, desc, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { DocumentTypes, CHARS_PER_CARTELLA } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import {
  SiaeExportInputSchema,
  type SiaeExportInput,
} from "../documents.schema";
import {
  DbError,
  ForbiddenError,
  SubjectNotFoundError,
} from "../documents.errors";

// ─── Pure helpers ────────────────────────────────────────────────────────────

// A single "cartella" is 1,800 characters per the spec. Footer numbering is
// derived from the character offset of the body, not from the PDF page count,
// so it stays deterministic regardless of font metrics.
export const formatCartellaFooter = (pageCharOffset: number): string => {
  const clamped = Math.max(0, pageCharOffset);
  const n = Math.floor(clamped / CHARS_PER_CARTELLA) + 1;
  return `cartella ${n}`;
};

export interface SiaeCoverContext {
  readonly logline: string | null;
}

const formatAuthorLine = (author: {
  fullName: string;
  taxCode: string | null;
}): string =>
  author.taxCode && author.taxCode.trim().length > 0
    ? `  • ${author.fullName}  [CF: ${author.taxCode}]`
    : `  • ${author.fullName}`;

export const buildSiaeCoverLines = (
  input: SiaeExportInput,
  context: SiaeCoverContext,
): ReadonlyArray<string> => {
  const lines: string[] = [
    "REPUBBLICA ITALIANA",
    "SIAE — Sezione OLAF",
    "SOGGETTO PER OPERA CINEMATOGRAFICA",
    "",
    `Titolo:              ${input.title}`,
    `Genere dichiarato:   ${input.declaredGenre || "non dichiarato"}`,
    `Durata stimata:      ${input.estimatedDurationMinutes} minuti`,
    `Data di compilazione: ${input.compilationDate}`,
    "",
    "Autore/i:",
    ...input.authors.map(formatAuthorLine),
    "",
    "Logline:",
    `  ${context.logline && context.logline.trim().length > 0 ? context.logline.trim() : "non definita"}`,
  ];
  if (input.depositNotes && input.depositNotes.trim().length > 0) {
    lines.push("", "Note di deposito:", `  ${input.depositNotes.trim()}`);
  }
  return lines;
};

export interface ParsedMarkdownBlock {
  readonly kind: "heading" | "paragraph";
  readonly text: string;
}

// Strip HTML tags when ProseMirror-authored content is stored as HTML.
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

// Strip inline markdown syntax so asterisks/underscores don't appear in the PDF.
const stripInlineMarkdown = (text: string): string =>
  text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/~~(.+?)~~/gs, "$1");

// Minimal parser: `## heading` lines become heading blocks, blank lines break
// paragraphs. Handles both HTML (ProseMirror output) and plain markdown.
export const parseSubjectMarkdown = (
  raw: string,
): ReadonlyArray<ParsedMarkdownBlock> => {
  const plain = stripHtml(raw);
  if (!plain || plain.trim().length === 0) return [];
  const blocks: ParsedMarkdownBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const text = stripInlineMarkdown(
      buffer.join(" ").replace(/\s+/g, " ").trim(),
    );
    if (text.length > 0) blocks.push({ kind: "paragraph", text });
    buffer = [];
  };
  for (const rawLine of plain.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      blocks.push({
        kind: "heading",
        text: stripInlineMarkdown(line.replace(/^#{1,6}\s+/, "").trim()),
      });
      continue;
    }
    if (line.trim().length === 0) {
      flush();
      continue;
    }
    buffer.push(line.trim());
  }
  flush();
  return blocks;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";

export const buildSiaeFilename = (title: string): string =>
  `${slugify(title)}-soggetto-siae.pdf`;

// ─── PDF rendering ───────────────────────────────────────────────────────────

const MARGIN = 72;

const renderCover = (
  doc: PDFKit.PDFDocument,
  input: SiaeExportInput,
  context: SiaeCoverContext,
) => {
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#000");
  doc.text("REPUBBLICA ITALIANA", { align: "center" });
  doc.text("SIAE — Sezione OLAF", { align: "center" });
  doc.text("SOGGETTO PER OPERA CINEMATOGRAFICA", { align: "center" });
  doc.moveDown(2);

  doc.font("Times-Roman").fontSize(12);
  const body = buildSiaeCoverLines(input, context).slice(3); // skip the 3 title lines already rendered above
  for (const line of body) {
    doc.text(line);
  }
};

const renderBody = (doc: PDFKit.PDFDocument, markdown: string) => {
  const blocks = parseSubjectMarkdown(markdown);
  if (blocks.length === 0) {
    doc
      .font("Times-Italic")
      .fontSize(12)
      .fillColor("#000")
      .text("(soggetto non ancora redatto)");
    return;
  }
  let offset = 0;
  let lastCartella = 0;
  for (const block of blocks) {
    if (block.kind === "heading") {
      doc.moveDown(0.8);
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#000")
        .text(block.text);
      doc.moveDown(0.3);
    } else {
      doc
        .font("Times-Roman")
        .fontSize(12)
        .fillColor("#000")
        .text(block.text, { align: "left", paragraphGap: 8, lineGap: 2 });
    }
    offset += block.text.length + 1;
    const currentCartella = Math.floor(offset / CHARS_PER_CARTELLA) + 1;
    if (currentCartella !== lastCartella) {
      lastCartella = currentCartella;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#888")
        .text(formatCartellaFooter(offset), { align: "right" });
      doc.fillColor("#000");
    }
  }
};

const renderSiaePdf = (
  input: SiaeExportInput,
  context: SiaeCoverContext,
  soggetto: string,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderCover(doc, input, context);
    doc.addPage();
    renderBody(doc, soggetto);

    doc.end();
  });

// ─── Data loaders ────────────────────────────────────────────────────────────

interface LoadedProject {
  readonly id: string;
  readonly title: string;
  readonly logline: string | null;
  readonly teamId: string | null;
  readonly ownerId: string | null;
  readonly isArchived: boolean;
}

type SiaeAccessError = SubjectNotFoundError | ForbiddenError | DbError;

const requireSiaeEditAccess = (
  db: Db,
  projectId: string,
): ResultAsync<LoadedProject, SiaeAccessError> =>
  requireProjectAccess(db, projectId, "edit")
    .map(
      ({ project }): LoadedProject => ({
        id: project.id,
        title: project.title,
        logline: null,
        teamId: project.teamId,
        ownerId: project.ownerId,
        isArchived: project.isArchived,
      }),
    )
    .mapErr(
      (e): SiaeAccessError =>
        e._tag === "ProjectNotFoundError"
          ? new SubjectNotFoundError(projectId)
          : e,
    );

const loadLogline = (
  db: Db,
  projectId: string,
): ResultAsync<string | null, DbError> =>
  ResultAsync.fromPromise(
    db.query.documents
      .findFirst({
        where: and(
          eq(documents.projectId, projectId),
          eq(documents.type, DocumentTypes.LOGLINE),
        ),
      })
      .then((row) =>
        row?.content && row.content.length > 0 ? row.content : null,
      ),
    (e) => new DbError("subject-siae/loadLogline", e),
  );

const loadSoggetto = (
  db: Db,
  projectId: string,
): ResultAsync<string, SubjectNotFoundError | DbError> =>
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
    (e) => new DbError("subject-siae/loadSoggetto", e),
  ).andThen((content) =>
    content && content.trim().length > 0
      ? ok<string, SubjectNotFoundError | DbError>(content)
      : err<string, SubjectNotFoundError | DbError>(
          new SubjectNotFoundError(projectId),
        ),
  );

// ─── Server function ─────────────────────────────────────────────────────────

type SiaeExportError = SubjectNotFoundError | ForbiddenError | DbError;

export interface SiaeExportPayload {
  readonly base64: string;
  readonly filename: string;
  readonly mimeType: "application/pdf";
}

export const exportSubjectSiae = createServerFn({ method: "POST" })
  .validator(SiaeExportInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<SiaeExportPayload, SiaeExportError>> => {
      const db = await getDb();

      const chain = await requireSiaeEditAccess(db, data.projectId)
        .andThen((project) =>
          ResultAsync.combine([
            loadLogline(db, project.id),
            loadSoggetto(db, project.id),
          ]).map(
            ([logline, soggetto]) => ({ project, logline, soggetto }) as const,
          ),
        )
        .andThen(({ logline, soggetto }) =>
          ResultAsync.fromPromise(
            renderSiaePdf(data, { logline }, soggetto),
            (e) => new DbError("pdf:siae", e),
          ).map(
            (buffer): SiaeExportPayload => ({
              base64: buffer.toString("base64"),
              filename: buildSiaeFilename(data.title),
              mimeType: "application/pdf",
            }),
          ),
        );

      return toShape(chain);
    },
  );
