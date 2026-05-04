import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { and, desc, eq } from "drizzle-orm";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { DocumentTypes, type Genre } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import { GenerateLoglineInputSchema, LOGLINE_MAX } from "../documents.schema";
import {
  DbError,
  ForbiddenError,
  RateLimitedError,
  SubjectNotFoundError,
} from "../documents.errors";
import { checkAndStampRateLimit } from "~/server/rate-limit";
import { callHaiku, extractText } from "~/features/ai";

const COOLDOWN_MS = 30_000;
const HAIKU_MODEL = "claude-haiku-4-5";
const LOGLINE_HARD_CAP = 500;

type LoglineFromSubjectError =
  | SubjectNotFoundError
  | RateLimitedError
  | ForbiddenError
  | DbError;

interface LoadedProject {
  readonly id: string;
  readonly title: string;
  readonly genre: Genre | null;
  readonly format: string;
  readonly teamId: string | null;
  readonly ownerId: string | null;
  readonly isArchived: boolean;
}

interface SubjectPromptFewShot {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface SubjectPromptPayload {
  readonly system: string;
  readonly fewShot: ReadonlyArray<SubjectPromptFewShot>;
  readonly user: string;
}

const requireEditAccess = (
  db: Db,
  projectId: string,
): ResultAsync<LoadedProject, LoglineFromSubjectError> =>
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
      (e): LoglineFromSubjectError =>
        e._tag === "ProjectNotFoundError"
          ? new SubjectNotFoundError(projectId)
          : e,
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
    (e) => new DbError("logline-from-subject/loadSoggetto", e),
  );

const truncateLogline = (raw: string): string => {
  const trimmed = raw.trim().replace(/^["«»"']+|["«»"']+$/g, "");
  if (trimmed.length <= LOGLINE_HARD_CAP) return trimmed;
  return trimmed.slice(0, LOGLINE_HARD_CAP - 1).trimEnd() + "…";
};

const LOGLINE_SYSTEM_PROMPT = `
Sei Cesare, un editor narrativo esperto nella tradizione cinematografica italiana. Aiuti un autore a estrarre una logline dal soggetto già scritto.

Compito: produci UNA SOLA logline in italiano.

Regole:
1. Massimo 500 caratteri, idealmente molto meno — una frase sola.
2. Presente indicativo.
3. La logline deve contenere: protagonista, conflitto, posta in gioco.
4. Nessuna intestazione, nessun preambolo, nessun "Logline:" iniziale.
5. Nessun elenco puntato, nessun markdown, nessuna virgoletta attorno alla frase.
6. Non inventare elementi non presenti nel soggetto fornito.
`.trim();

const LOGLINE_FEW_SHOT: ReadonlyArray<SubjectPromptFewShot> = [
  {
    role: "user",
    content: [
      "Genere: drama",
      "Formato: feature",
      "Titolo di lavoro: L'ultima estate a Marzano",
      "",
      "Soggetto:",
      "Marzano è un paese dell'entroterra calabrese che sta morendo. Marta, trent'anni, torna per vendere la casa della madre scomparsa, ma si ritrova a fare i conti con il fratello rimasto, con un amore lasciato in sospeso e con la domanda che ha rimandato da sempre: a chi appartiene davvero. Alla fine rinuncia alla vendita e decide di restare un altro inverno.",
    ].join("\n"),
  },
  {
    role: "assistant",
    content:
      "Tornata nel paese calabrese che ha abbandonato per vendere la casa di sua madre, Marta deve scegliere tra la vita costruita in città e le radici che l'hanno aspettata, mentre il fratello rimasto mette a rischio l'unica eredità che le resta.",
  },
];

const buildPrompt = (
  project: Pick<LoadedProject, "title" | "genre" | "format">,
  soggetto: string,
): SubjectPromptPayload => ({
  system: LOGLINE_SYSTEM_PROMPT,
  fewShot: LOGLINE_FEW_SHOT,
  user: [
    `Genere: ${project.genre ?? "non specificato"}`,
    `Formato: ${project.format}`,
    `Titolo di lavoro: ${project.title}`,
    "",
    "Soggetto:",
    soggetto.trim(),
  ].join("\n"),
});

const callAnthropic = (
  payload: SubjectPromptPayload,
  operation: string,
): ResultAsync<string, DbError> =>
  callHaiku(
    {
      system: payload.system,
      fewShot: payload.fewShot,
      user: payload.user,
      model: HAIKU_MODEL,
      maxTokens: 400,
    },
    operation,
  )
    .map((res) => extractText(res.content) ?? "")
    .mapErr((e) => new DbError(operation, e.cause ?? e.message));

export { LOGLINE_MAX };

export const generateLoglineFromSubject = createServerFn({ method: "POST" })
  .validator(GenerateLoglineInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ logline: string }, LoglineFromSubjectError>> => {
      const db = await getDb();

      const chain = await requireEditAccess(db, data.projectId)
        .andThen((project) =>
          checkAndStampRateLimit(
            db,
            project.id,
            "subject:logline-extract",
            COOLDOWN_MS,
          ).map(() => project),
        )
        .andThen((project) =>
          loadCurrentSoggetto(db, project.id).andThen((soggetto) =>
            soggetto && soggetto.trim().length > 0
              ? ok<
                  { project: LoadedProject; soggetto: string },
                  LoglineFromSubjectError
                >({ project, soggetto })
              : err<
                  { project: LoadedProject; soggetto: string },
                  LoglineFromSubjectError
                >(new SubjectNotFoundError(project.id)),
          ),
        )
        .andThen(({ project, soggetto }) => {
          if (process.env["MOCK_AI"] === "true") {
            return ok<{ logline: string }, DbError>({
              logline: truncateLogline(`Logline mock di "${project.title}"`),
            });
          }
          return callAnthropic(
            buildPrompt(project, soggetto),
            "anthropic:subject-logline",
          ).map((text) => ({ logline: truncateLogline(text) }));
        });

      return toShape(chain);
    },
  );
