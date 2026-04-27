import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { and, desc, eq } from "drizzle-orm";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { DocumentTypes, type Genre } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
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
import { callHaiku, extractText } from "~/features/ai";

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

// Wraps the shared access helper, remapping ProjectNotFoundError →
// SubjectNotFoundError so the public error contract of the AI server
// functions is unchanged. ForbiddenError flows through verbatim.
const requireSubjectEditAccess = (
  db: Db,
  projectId: string,
): ResultAsync<LoadedProject, SubjectAiError> =>
  requireProjectAccess(db, projectId, "edit")
    .map(({ project }) => ({
      id: project.id,
      title: project.title,
      genre: project.genre as Genre | null,
      format: project.format,
      teamId: project.teamId,
      ownerId: project.ownerId,
      isArchived: project.isArchived,
    }))
    .mapErr(
      (e): SubjectAiError =>
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
  callHaiku(
    {
      system: payload.system,
      fewShot: payload.fewShot,
      user: payload.user,
      model: HAIKU_MODEL,
      maxTokens,
    },
    operation,
  )
    .map((res) => extractText(res.content) ?? "")
    .mapErr((e) => new DbError(operation, e.cause ?? e.message));

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
      const db = await getDb();

      const chain = await requireSubjectEditAccess(db, data.projectId)
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
      const db = await getDb();

      const chain = await requireSubjectEditAccess(db, data.projectId)
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
