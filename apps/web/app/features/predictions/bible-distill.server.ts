import { createHash } from "node:crypto";
import { generateText, jsonSchema, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { eq, inArray } from "drizzle-orm";
import {
  filmBibles,
  screenplays,
  scenes,
  documents,
  documentVersions,
  projects,
} from "@oh-writers/db/schema";
import {
  DocumentTypes,
  FilmBibleSchema,
  formatSceneSummary,
  type FilmBible,
  type SceneSummary,
} from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { DbError, repairMojibake } from "@oh-writers/utils";
import { findFilmBibleFixture } from "./_mocks/film-bible.fixtures";

// Walk an arbitrary JSON value and run repairMojibake on every string leaf.
// Used to clean Anthropic tool-call inputs before they hit the DB.
const repairMojibakeDeep = (value: unknown): unknown => {
  if (typeof value === "string") return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairMojibakeDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = repairMojibakeDeep(v);
    return out;
  }
  return value;
};

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BibleDistillError {
  readonly _tag = "BibleDistillError" as const;
  readonly message: string;
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    this.message = `Bible distillation failed in ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

export const computeBibleFingerprint = (
  sceneSummaryFingerprints: readonly string[],
  documentVersionIds: readonly string[],
  projectMeta: { genre: string | null; format: string; logline: string | null },
): string => {
  const sorted = [...sceneSummaryFingerprints].sort().join(",");
  const docsSorted = [...documentVersionIds].sort().join(",");
  const meta = `${projectMeta.genre ?? ""}|${projectMeta.format}|${projectMeta.logline ?? ""}`;
  return createHash("sha256")
    .update(`${sorted}::${docsSorted}::${meta}`)
    .digest("hex")
    .slice(0, 16);
};

// ─── Tool definition ─────────────────────────────────────────────────────────

const EMIT_TOOL_NAME = "emit_film_bible";

const EMIT_TOOL = {
  name: EMIT_TOOL_NAME,
  description:
    "Emit the distilled Film Bible for the project, synthesised from scene summaries and narrative documents.",
  input_schema: {
    type: "object",
    properties: {
      settingSummary: { type: "string" },
      genreAndTone: { type: "string" },
      centralConflict: { type: "string" },
      productionConstraints: { type: "array", items: { type: "string" } },
      recurringLocations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            canonicalName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            locationType: { type: "string" },
            sceneCount: { type: "integer", minimum: 0 },
            settingPrior: { type: "string" },
          },
          required: [
            "canonicalName",
            "aliases",
            "locationType",
            "sceneCount",
            "settingPrior",
          ],
        },
      },
      keyCharacters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            arc: { type: ["string", "null"] },
          },
          required: ["name", "role", "arc"],
        },
      },
    },
    required: [
      "settingSummary",
      "genreAndTone",
      "centralConflict",
      "productionConstraints",
      "recurringLocations",
      "keyCharacters",
    ],
  },
} as const;

const DISTILL_SYSTEM_PROMPT = `You are a senior script editor and production analyst.
Synthesise a Film Bible from the provided scene summaries and narrative documents.

Authority order for resolving conflicts: treatment > outline > synopsis > soggetto > logline.

For recurringLocations: GROUP sibling set names that belong to the same physical place
(e.g. "Bancone", "Sala", "Cucina" all belong to one restaurant → one entry with all as aliases).
The settingPrior must be specific enough to guide a location scout: include city, region, type
(e.g. "small-town restaurant, Marche region, Italy" — NOT "a restaurant").

Be concise. The bible is injected into every AI call as a cached block.`;

// ─── AI SDK Sonnet call ───────────────────────────────────────────────────────

const EMIT_SDK_TOOL = tool({
  description: EMIT_TOOL.description,
  inputSchema: jsonSchema(
    EMIT_TOOL.input_schema as unknown as Parameters<typeof jsonSchema>[0],
  ),
});

const callSonnetForcedTool = async (
  systemPrompt: string,
  userMessage: string,
): Promise<unknown> => {
  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools: { [EMIT_TOOL_NAME]: EMIT_SDK_TOOL },
    toolChoice: { type: "tool", toolName: EMIT_TOOL_NAME },
    maxOutputTokens: 2048,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "bible-distill",
    },
  });
  const emitCall = result.toolCalls.find(
    (tc) => tc.toolName === EMIT_TOOL_NAME,
  );
  return emitCall ? repairMojibakeDeep(emitCall.input) : null;
};

// ─── Input assembly ───────────────────────────────────────────────────────────

interface DistillInput {
  readonly sceneSummaries: readonly SceneSummary[];
  readonly documents: readonly { type: string; content: string }[];
  readonly projectMeta: {
    title: string;
    genre: string | null;
    format: string;
    logline: string | null;
  };
}

const buildDistillUserMessage = (input: DistillInput): string => {
  const scenePart =
    input.sceneSummaries.length > 0
      ? `SCENE SUMMARIES:\n${input.sceneSummaries.map(formatSceneSummary).join("\n\n")}`
      : "SCENE SUMMARIES: (none yet)";

  const docPart =
    input.documents.length > 0
      ? `NARRATIVE DOCUMENTS:\n${input.documents
          .map((d) => `[${d.type.toUpperCase()}]\n${d.content.slice(0, 3000)}`)
          .join("\n\n")}`
      : "NARRATIVE DOCUMENTS: (none)";

  const meta = [
    `Titolo: ${input.projectMeta.title}`,
    input.projectMeta.genre ? `Genere: ${input.projectMeta.genre}` : null,
    `Formato: ${input.projectMeta.format}`,
    input.projectMeta.logline ? `Logline: ${input.projectMeta.logline}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `PROGETTO:\n${meta}\n\n${scenePart}\n\n${docPart}`;
};

// ─── Distillation ─────────────────────────────────────────────────────────────

const distillWithAI = (
  input: DistillInput,
  fingerprint: string,
): ResultAsync<FilmBible, BibleDistillError> =>
  ResultAsync.fromPromise(
    callSonnetForcedTool(DISTILL_SYSTEM_PROMPT, buildDistillUserMessage(input)),
    (e) => new BibleDistillError("distillBible.sonnet", e),
  ).andThen((raw) => {
    const parsed = FilmBibleSchema.safeParse({
      ...(raw as object),
      sourceDocumentSnapshot: fingerprint,
    });
    return parsed.success
      ? okAsync(parsed.data)
      : errAsync(new BibleDistillError("distillBible.parse", parsed.error));
  });

const distillWithMock = (
  input: DistillInput,
  fingerprint: string,
): ResultAsync<FilmBible, BibleDistillError> =>
  okAsync(findFilmBibleFixture(input.projectMeta.title, fingerprint));

export const distillBible = (
  input: DistillInput,
  fingerprint: string,
): ResultAsync<FilmBible, BibleDistillError> =>
  process.env["MOCK_AI"] === "true"
    ? distillWithMock(input, fingerprint)
    : distillWithAI(input, fingerprint);

// ─── Debounce ─────────────────────────────────────────────────────────────────

const distillInFlight = new Set<string>();

// ─── Load project data for distillation ──────────────────────────────────────

interface ProjectDistillData {
  readonly screenplayId: string | null;
  readonly genre: string | null;
  readonly format: string;
  readonly logline: string | null;
  readonly title: string;
  readonly documents: Array<{
    type: string;
    content: string;
    currentVersionId: string | null;
  }>;
}

const loadProjectDistillData = (
  db: Db,
  projectId: string,
): ResultAsync<ProjectDistillData, DbError> =>
  ResultAsync.fromPromise(
    (async (): Promise<ProjectDistillData> => {
      const [project] = await db
        .select({
          title: projects.title,
          genre: projects.genre,
          format: projects.format,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) throw new Error(`Project not found: ${projectId}`);

      const [screenplay] = await db
        .select({ id: screenplays.id })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);

      const docs = await db
        .select({
          id: documents.id,
          type: documents.type,
          content: documents.content,
          currentVersionId: documents.currentVersionId,
        })
        .from(documents)
        .where(eq(documents.projectId, projectId));

      // The logline is the `logline` document (single source of truth — spec
      // 47c), not a project column. Read it from the docs already loaded above.
      const loglineDoc = docs.find((d) => d.type === DocumentTypes.LOGLINE);
      const logline =
        loglineDoc && loglineDoc.content.trim().length > 0
          ? loglineDoc.content
          : null;

      return {
        screenplayId: screenplay?.id ?? null,
        genre: project.genre ?? null,
        format: project.format,
        logline,
        title: project.title,
        documents: docs.map((d) => ({
          type: d.type,
          content: d.content,
          currentVersionId: d.currentVersionId,
        })),
      };
    })(),
    (e) => new DbError("loadProjectDistillData", e),
  );

const loadDocumentContents = (
  db: Db,
  docs: Array<{
    type: string;
    content: string;
    currentVersionId: string | null;
  }>,
): ResultAsync<Array<{ type: string; content: string }>, DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const versionIds = docs
        .map((d) => d.currentVersionId)
        .filter((v): v is string => v !== null);

      const versionContentById = new Map<string, string>();
      if (versionIds.length > 0) {
        const rows = await db
          .select({
            id: documentVersions.id,
            content: documentVersions.content,
          })
          .from(documentVersions)
          .where(inArray(documentVersions.id, versionIds));
        for (const r of rows) versionContentById.set(r.id, r.content);
      }

      return docs
        .filter((d) => {
          const content = d.currentVersionId
            ? (versionContentById.get(d.currentVersionId) ?? d.content)
            : d.content;
          return content.trim().length > 0;
        })
        .map((d) => ({
          type: d.type,
          content: d.currentVersionId
            ? (versionContentById.get(d.currentVersionId) ?? d.content)
            : d.content,
        }));
    })(),
    (e) => new DbError("loadDocumentContents", e),
  );

const loadSceneSummariesForBible = (
  db: Db,
  screenplayId: string,
): ResultAsync<
  { summaries: SceneSummary[]; fingerprints: string[] },
  DbError
> =>
  ResultAsync.fromPromise(
    db
      .select({
        sceneSummary: scenes.sceneSummary,
        sceneSummaryFingerprint: scenes.sceneSummaryFingerprint,
      })
      .from(scenes)
      .where(eq(scenes.screenplayId, screenplayId)),
    (e) => new DbError("loadSceneSummariesForBible", e),
  ).map((rows) => {
    const summaries: SceneSummary[] = [];
    const fingerprints: string[] = [];
    for (const r of rows) {
      if (r.sceneSummary !== null && r.sceneSummaryFingerprint !== null) {
        // Loose cast — SceneSummarySchema validates at the server boundary
        summaries.push(r.sceneSummary as SceneSummary);
        fingerprints.push(r.sceneSummaryFingerprint);
      }
    }
    return { summaries, fingerprints };
  });

// ─── Load or distill ──────────────────────────────────────────────────────────

/**
 * Return the current Film Bible for the project.
 * - No row → distill synchronously (first-time setup).
 * - Fingerprint matches → return cached row immediately.
 * - Fingerprint mismatch → return existing row; re-distill in background (debounced).
 */
export const loadFilmBible = (
  db: Db,
  projectId: string,
): ResultAsync<FilmBible, DbError | BibleDistillError> =>
  loadProjectDistillData(db, projectId).andThen((projectData) => {
    const screenplayId = projectData.screenplayId;

    const summaryTask: ResultAsync<
      { summaries: SceneSummary[]; fingerprints: string[] },
      DbError
    > = screenplayId
      ? loadSceneSummariesForBible(db, screenplayId)
      : okAsync({ summaries: [], fingerprints: [] });

    return summaryTask.andThen(({ summaries, fingerprints }) =>
      loadDocumentContents(db, projectData.documents).andThen((docContents) => {
        const docVersionIds = projectData.documents
          .map((d) => d.currentVersionId)
          .filter((v): v is string => v !== null);

        const fingerprint = computeBibleFingerprint(
          fingerprints,
          docVersionIds,
          {
            genre: projectData.genre,
            format: projectData.format,
            logline: projectData.logline,
          },
        );

        return ResultAsync.fromPromise(
          db
            .select()
            .from(filmBibles)
            .where(eq(filmBibles.projectId, projectId))
            .limit(1)
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("loadFilmBible.find", e),
        ).andThen((existing) => {
          const input: DistillInput = {
            sceneSummaries: summaries,
            documents: docContents,
            projectMeta: {
              title: projectData.title,
              genre: projectData.genre,
              format: projectData.format,
              logline: projectData.logline,
            },
          };

          if (!existing) {
            // First time — distill synchronously
            return distillBible(input, fingerprint).andThen((bible) =>
              persistBible(db, projectId, bible, fingerprint).map(() => bible),
            );
          }

          const cached = FilmBibleSchema.safeParse(existing.bible);
          if (!cached.success) {
            // Corrupted row — re-distill synchronously
            return distillBible(input, fingerprint).andThen((bible) =>
              persistBible(db, projectId, bible, fingerprint).map(() => bible),
            );
          }

          if (existing.fingerprint === fingerprint) {
            return okAsync(cached.data);
          }

          // Fingerprint mismatch — return stale, background re-distill
          if (!distillInFlight.has(projectId)) {
            distillInFlight.add(projectId);
            void distillBible(input, fingerprint)
              .andThen((bible) =>
                persistBible(db, projectId, bible, fingerprint),
              )
              .map(() => {
                distillInFlight.delete(projectId);
              })
              .mapErr((e) => {
                distillInFlight.delete(projectId);
                return e;
              });
          }

          return okAsync(cached.data);
        });
      }),
    );
  });

const persistBible = (
  db: Db,
  projectId: string,
  bible: FilmBible,
  fingerprint: string,
): ResultAsync<void, DbError> =>
  ResultAsync.fromPromise(
    db
      .insert(filmBibles)
      .values({ projectId, bible, fingerprint })
      .onConflictDoUpdate({
        target: filmBibles.projectId,
        set: { bible, fingerprint, updatedAt: new Date() },
      }),
    (e) => new DbError("persistBible", e),
  ).map(() => undefined);
