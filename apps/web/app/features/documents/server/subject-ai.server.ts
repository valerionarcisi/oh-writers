import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { and, desc, eq } from "drizzle-orm";
import { documents, documentVersions, projects } from "@oh-writers/db/schema";
import { DocumentTypes, type Genre } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { canEdit, getMembership } from "~/server/permissions";
import {
  GenerateSubjectSectionInputSchema,
  GenerateLoglineInputSchema,
  LOGLINE_MAX,
} from "../documents.schema";
import {
  DbError,
  ForbiddenError,
  SubjectNotFoundError,
  SubjectRateLimitedError,
} from "../documents.errors";
import {
  buildSubjectSectionPrompt,
  buildLoglineFromSubjectPrompt,
  type SubjectPromptPayload,
  type SubjectPromptProject,
} from "../lib/subject-prompt";
import { checkAndStampRateLimit } from "../../breakdown/lib/rate-limit";
import { mockSubjectSection } from "~/mocks/ai-responses";

const COOLDOWN_MS = 30_000;
const HAIKU_MODEL = "claude-haiku-4-5";
const LOGLINE_HARD_CAP = 500;

type SubjectAiError =
  | SubjectNotFoundError
  | SubjectRateLimitedError
  | ForbiddenError
  | DbError;

// The breakdown rate-limit helper returns BreakdownRateLimitedError; the
// documents domain has its own SubjectRateLimitedError with identical shape.
// We remap at the boundary so callers never see breakdown-tagged errors.
const mapRateLimitError = (error: {
  _tag: string;
  retryAfterMs?: number;
}): SubjectRateLimitedError | DbError =>
  error._tag === "BreakdownRateLimitedError"
    ? new SubjectRateLimitedError(error.retryAfterMs ?? COOLDOWN_MS)
    : (error as DbError);

interface LoadedProject {
  readonly id: string;
  readonly title: string;
  readonly genre: Genre | null;
  readonly format: string;
  readonly teamId: string | null;
  readonly ownerId: string | null;
  readonly isArchived: boolean;
}

const loadProject = (
  db: Db,
  projectId: string,
): ResultAsync<LoadedProject, SubjectNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, projectId) })
      .then((row) => row ?? null),
    (e): SubjectNotFoundError | DbError =>
      new DbError("subject-ai/loadProject", e),
  ).andThen((row) =>
    row
      ? ok({
          id: row.id,
          title: row.title,
          genre: row.genre as Genre | null,
          format: row.format,
          teamId: row.teamId,
          ownerId: row.ownerId,
          isArchived: row.isArchived,
        })
      : err(new SubjectNotFoundError(projectId)),
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
    (e) => new DbError("subject-ai/loadLogline", e),
  );

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
    (e) => new DbError("subject-ai/loadSoggetto", e),
  );

const ensureCanEdit = (
  db: Db,
  project: LoadedProject,
  userId: string,
): ResultAsync<LoadedProject, ForbiddenError | DbError> => {
  const membership$ = project.teamId
    ? getMembership(db, project.teamId, userId)
    : ResultAsync.fromSafePromise<null, DbError>(Promise.resolve(null));
  return membership$.andThen((membership) =>
    canEdit(project, userId, membership)
      ? ok<LoadedProject, ForbiddenError | DbError>(project)
      : err<LoadedProject, ForbiddenError | DbError>(
          new ForbiddenError("generate subject"),
        ),
  );
};

const stampRateLimit = (
  db: Db,
  projectId: string,
  action: string,
): ResultAsync<void, SubjectRateLimitedError | DbError> =>
  checkAndStampRateLimit(db, projectId, action, COOLDOWN_MS).mapErr(
    mapRateLimitError,
  );

const callAnthropic = (
  payload: SubjectPromptPayload,
  maxTokens: number,
  operation: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const sdkModule = "@anthropic-ai/sdk";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdk: any = await import(/* @vite-ignore */ sdkModule);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Anthropic = (sdk.default ?? sdk) as any;
      const client = new Anthropic({
        apiKey: process.env["ANTHROPIC_API_KEY"]!,
      });
      const response = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: payload.system,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: JSON.stringify(payload.fewShot),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: payload.user }],
      });
      const block = response.content.find(
        (b: { type: string }) => b.type === "text",
      );
      if (!block || block.type !== "text") return "";
      return (block.text as string).trim();
    })(),
    (e) => new DbError(operation, e),
  );

const truncateLogline = (raw: string): string => {
  const trimmed = raw.trim().replace(/^["«»"']+|["«»"']+$/g, "");
  if (trimmed.length <= LOGLINE_HARD_CAP) return trimmed;
  return trimmed.slice(0, LOGLINE_HARD_CAP - 1).trimEnd() + "…";
};

const toPromptProject = (
  project: LoadedProject,
  logline: string | null,
): SubjectPromptProject => ({
  title: project.title,
  genre: project.genre,
  format: project.format,
  logline,
});

// ─── generateSubjectSection ───────────────────────────────────────────────────

export const generateSubjectSection = createServerFn({ method: "POST" })
  .validator(GenerateSubjectSectionInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ text: string }, SubjectAiError>> => {
      const user = await requireUser();
      const db = await getDb();

      const chain = await loadProject(db, data.projectId)
        .andThen((project) => ensureCanEdit(db, project, user.id))
        .andThen((project) =>
          stampRateLimit(db, project.id, `subject:${data.section}`).map(
            () => project,
          ),
        )
        .andThen((project) =>
          ResultAsync.combine([
            loadCurrentSoggetto(db, project.id),
            loadLogline(db, project.id),
          ]).map(
            ([currentSoggetto, logline]) =>
              ({ project, currentSoggetto, logline }) as const,
          ),
        )
        .andThen(({ project, currentSoggetto, logline }) => {
          if (process.env["MOCK_AI"] === "true") {
            return ok<{ text: string }, DbError>({
              text: mockSubjectSection(data.section, project.genre),
            });
          }
          const payload = buildSubjectSectionPrompt({
            section: data.section,
            project: toPromptProject(project, logline),
            currentSoggetto,
          });
          return callAnthropic(payload, 1500, "anthropic:subject-section").map(
            (text) => ({ text }),
          );
        });

      return toShape(chain);
    },
  );

// ─── generateLoglineFromSubject ───────────────────────────────────────────────

export const generateLoglineFromSubject = createServerFn({ method: "POST" })
  .validator(GenerateLoglineInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ logline: string }, SubjectAiError>> => {
      const user = await requireUser();
      const db = await getDb();

      const chain = await loadProject(db, data.projectId)
        .andThen((project) => ensureCanEdit(db, project, user.id))
        .andThen((project) =>
          stampRateLimit(db, project.id, "subject:logline-extract").map(
            () => project,
          ),
        )
        .andThen((project) =>
          loadCurrentSoggetto(db, project.id).andThen((soggetto) =>
            soggetto && soggetto.trim().length > 0
              ? ok<
                  { project: LoadedProject; soggetto: string },
                  SubjectAiError
                >({ project, soggetto })
              : err<
                  { project: LoadedProject; soggetto: string },
                  SubjectAiError
                >(new SubjectNotFoundError(project.id)),
          ),
        )
        .andThen(({ project, soggetto }) => {
          if (process.env["MOCK_AI"] === "true") {
            const mocked = `Logline mock di "${project.title}"`;
            return ok<{ logline: string }, DbError>({
              logline: truncateLogline(mocked),
            });
          }
          const payload = buildLoglineFromSubjectPrompt({
            project: toPromptProject(project, null),
            soggetto,
          });
          return callAnthropic(payload, 400, "anthropic:subject-logline").map(
            (text) => ({
              logline: truncateLogline(text),
            }),
          );
        });

      return toShape(chain);
    },
  );

// Re-exported to document the actual logline cap used for truncation.
// The schema's LOGLINE_MAX is 200; we enforce a 500-char hard wire-cap here
// because the Cesare logline extraction is more expansive than the manual
// logline document. The client decides whether to accept it verbatim or
// further trim it before persisting to the logline document.
export { LOGLINE_MAX };
