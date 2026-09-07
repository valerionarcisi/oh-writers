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
import { DocumentTypes, translations } from "@oh-writers/domain";
import {
  toShape,
  type ResultShape,
  stripCodeFences,
  skipFountainTitlePage,
} from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import { loadDocumentEverAiTouched } from "./ai-disclosure.server";
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

/**
 * An inline run: a span of text carrying the marks active over it. WYSIWYG —
 * the DOCX must reproduce exactly the bold/italic/underline the user sees in
 * the narrative editor (Spec 65: `strong`/`em`; `underline` parsed defensively
 * even though the editor schema only exposes bold + italic today).
 */
export type InlineRun = {
  readonly text: string;
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly underline?: boolean;
};

export type ParsedBlock =
  | { readonly kind: "heading"; readonly level: 2; readonly runs: InlineRun[] }
  | { readonly kind: "paragraph"; readonly runs: InlineRun[] };

// Active inline marks while walking the HTML token stream.
interface ActiveMarks {
  readonly bold: boolean;
  readonly italics: boolean;
  readonly underline: boolean;
}

const NO_MARKS: ActiveMarks = {
  bold: false,
  italics: false,
  underline: false,
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

// Map a tag name to the mark it toggles (null = not a mark-bearing tag).
const markForTag = (tag: string): keyof ActiveMarks | null => {
  switch (tag) {
    case "strong":
    case "b":
      return "bold";
    case "em":
    case "i":
      return "italics";
    case "u":
      return "underline";
    default:
      return null;
  }
};

// A run carries text only when it's non-empty; we collapse runs that share the
// exact same marks so the DOCX doesn't fragment a word across TextRuns.
const pushRun = (runs: InlineRun[], text: string, marks: ActiveMarks): void => {
  if (text.length === 0) return;
  const last = runs[runs.length - 1];
  if (
    last &&
    !!last.bold === marks.bold &&
    !!last.italics === marks.italics &&
    !!last.underline === marks.underline
  ) {
    runs[runs.length - 1] = { ...last, text: last.text + text };
    return;
  }
  runs.push({
    text,
    ...(marks.bold ? { bold: true } : {}),
    ...(marks.italics ? { italics: true } : {}),
    ...(marks.underline ? { underline: true } : {}),
  });
};

// Parse the inline HTML of a single block into marked runs. Handles nested
// inline tags (`<strong><em>x</em></strong>` → bold+italics) via a mark stack.
const parseInlineRuns = (inner: string): InlineRun[] => {
  const runs: InlineRun[] = [];
  const stack: Array<keyof ActiveMarks> = [];
  const marksFromStack = (): ActiveMarks =>
    stack.reduce<ActiveMarks>(
      (acc, mark) => ({ ...acc, [mark]: true }),
      NO_MARKS,
    );

  const tokens = inner.split(/(<[^>]+>)/g);
  for (const token of tokens) {
    if (token.length === 0) continue;
    if (token.startsWith("<")) {
      const closing = token.startsWith("</");
      const tagName = token
        .replace(/^<\/?/, "")
        .replace(/[\s/>].*$/, "")
        .toLowerCase();
      if (/^br$/.test(tagName)) {
        pushRun(runs, "\n", marksFromStack());
        continue;
      }
      const mark = markForTag(tagName);
      if (!mark) continue;
      if (closing) {
        const idx = stack.lastIndexOf(mark);
        if (idx !== -1) stack.splice(idx, 1);
      } else {
        stack.push(mark);
      }
      continue;
    }
    pushRun(runs, decodeEntities(token), marksFromStack());
  }
  return runs;
};

// Split ProseMirror HTML into block-level chunks, each tagged heading|paragraph
// with its raw inner HTML. `<h2>`/`<h3>` → heading, `<p>`/`<li>` → paragraph.
const HTML_BLOCK = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;

const parseHtmlBlocks = (html: string): ParsedBlock[] => {
  const blocks: ParsedBlock[] = [];
  for (const match of html.matchAll(HTML_BLOCK)) {
    const tag = match[1]!.toLowerCase();
    const runs = parseInlineRuns(match[2] ?? "");
    const hasText = runs.some((run) => run.text.trim().length > 0);
    if (!hasText) continue;
    blocks.push(
      /^h[1-6]$/.test(tag)
        ? { kind: "heading", level: 2, runs }
        : { kind: "paragraph", runs },
    );
  }
  return blocks;
};

// Markdown/plain fallback (no HTML tags): the soggetto is stored as HTML by the
// editor, but legacy / AI-emitted content may be markdown. We reuse the shared
// fence + fountain-title-page skip (single owner in @oh-writers/utils) and emit
// one plain run per block — markdown inline emphasis is flattened to text here
// (there's no reliable nesting model for the rare markdown case).
const stripInlineMarkdown = (text: string): string =>
  text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/~~(.+?)~~/gs, "$1");

const parseMarkdownBlocks = (content: string): ParsedBlock[] => {
  const body = skipFountainTitlePage(stripCodeFences(content)).trim();
  if (body.length === 0) return [];
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block): ParsedBlock => {
      if (/^#{1,6}\s+/.test(block)) {
        return {
          kind: "heading",
          level: 2,
          runs: [
            { text: stripInlineMarkdown(block.replace(/^#{1,6}\s+/, "")) },
          ],
        };
      }
      return {
        kind: "paragraph",
        runs: [{ text: stripInlineMarkdown(block) }],
      };
    });
};

/**
 * Parse soggetto source into blocks of inline runs. HTML (ProseMirror output)
 * is parsed mark-aware so bold/italic/underline survive into the DOCX (WYSIWYG);
 * plain markdown falls back to flat text runs.
 */
export const parseSoggettoMarkdown = (content: string): ParsedBlock[] => {
  if (content.trim().length === 0) return [];
  return content.includes("<")
    ? parseHtmlBlocks(content)
    : parseMarkdownBlocks(content);
};

interface ProjectForDocx {
  readonly title: string;
  readonly ownerName: string | null;
  // Canonical title-page fields (BUG-N63b) — the cover declares the AUTHORED
  // author / based-on / draft date, not just the account name.
  readonly titlePageAuthor: string | null;
  readonly basedOn: string | null;
  readonly draftDate: string | null;
  /** Spec 89 — AI disclosure stamp. True if the Soggetto document was ever
   *  Cesare-touched, permanent regardless of later manual edits. */
  readonly everAiTouched: boolean;
}

const nonEmpty = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

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
  if (nonEmpty(project.basedOn)) {
    titlePage.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: `Tratto da ${project.basedOn.trim()}`,
            italics: true,
            size: 22,
          }),
        ],
      }),
    );
  }
  // Author: prefer the AUTHORED title-page author; fall back to the account
  // owner's name only when no author was declared.
  const author = nonEmpty(project.titlePageAuthor)
    ? project.titlePageAuthor.trim()
    : nonEmpty(project.ownerName)
      ? project.ownerName.trim()
      : null;
  if (author) {
    titlePage.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: nonEmpty(project.draftDate) ? 200 : 1200 },
        children: [new TextRun({ text: `Scritto da ${author}`, size: 24 })],
      }),
    );
  }
  if (nonEmpty(project.draftDate)) {
    titlePage.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 1200 },
        children: [new TextRun({ text: project.draftDate.trim(), size: 20 })],
      }),
    );
  }
  if (project.everAiTouched) {
    titlePage.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 1200 },
        children: [
          new TextRun({
            text:
              translations.it["documents.export.subjectAiDisclosureNote"] ?? "",
            italics: true,
            size: 18,
          }),
        ],
      }),
    );
  }
  const runsToChildren = (runs: InlineRun[], forceBold: boolean): TextRun[] =>
    runs.map(
      (run) =>
        new TextRun({
          text: run.text,
          bold: forceBold || run.bold === true,
          italics: run.italics === true,
          underline: run.underline === true ? {} : undefined,
        }),
    );

  const body = parsed.map((block) =>
    block.kind === "heading"
      ? new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
          children: runsToChildren(block.runs, true),
        })
      : new Paragraph({
          spacing: { after: 200 },
          children: runsToChildren(block.runs, false),
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
  readonly titlePageAuthor: string | null;
  readonly basedOn: string | null;
  readonly draftDate: string | null;
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
            titlePageAuthor: project.titlePageAuthor,
            basedOn: project.titlePageBasedOn,
            draftDate: project.titlePageDraftDate,
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
          ResultAsync.combine([
            loadCurrentSoggetto(db, project.id),
            loadDocumentEverAiTouched(db, project.id, DocumentTypes.SOGGETTO),
          ]).map(
            ([soggetto, everAiTouched]) =>
              ({ project, soggetto, everAiTouched }) as const,
          ),
        )
        .andThen(({ project, soggetto, everAiTouched }) => {
          const parsed = parseSoggettoMarkdown(soggetto ?? "");
          const sections = buildSoggettoDocxSections(parsed, {
            title: project.title,
            ownerName: project.ownerName,
            titlePageAuthor: project.titlePageAuthor,
            basedOn: project.basedOn,
            draftDate: project.draftDate,
            everAiTouched,
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
