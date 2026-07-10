// apps/web/app/features/predictions/bible-distill.effect.ts
//
// Spec 48 (W-E5) — the Film Bible distiller as an Effect.
//
// Circle 2 of ADR 48: an LLM+DB distiller. The Sonnet forced-tool call used to
// hit the Vercel AI SDK `generateText` DIRECTLY (a hand-rolled second model
// transport with no retry/timeout). It now goes through the `AiClient` Layer —
// the single model-client injection point — so it inherits the W-E3
// retry/timeout policy and the duplicated `generateText`/`anthropic` plumbing is
// gone. `db` comes from the `DbService` Layer instead of being threaded by hand.
//
// External contract is UNCHANGED: `bible-distill.server.ts` exposes
// `loadFilmBible` as a `ResultAsync` (the shape `global-context.server.ts` and
// `cesare.server.ts` already consume) via `toResultAsync`. The fingerprint, the
// Zod validation, the prompt, and the mojibake repair are untouched.

import { createHash } from "node:crypto";
import { Effect } from "effect";
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
import { DbError, repairMojibake } from "@oh-writers/utils";
import { extractToolUse, type CallHaikuParams } from "~/features/ai";
import { AiClient, DbService } from "~/server/effect";
import { findFilmBibleFixture } from "./_mocks/film-bible.fixtures";

// Walk an arbitrary JSON value and run repairMojibake on every string leaf.
// Used to clean model tool-call inputs before they hit the DB.
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

// ─── Fingerprint (pure — unchanged) ────────────────────────────────────────────

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

const buildCallParams = (input: DistillInput): CallHaikuParams => ({
  system: DISTILL_SYSTEM_PROMPT,
  fewShot: {},
  user: buildDistillUserMessage(input),
  // Spec 84 (Wave 2) — tier, not a hardcoded model ID: resolves through the
  // gateway's tier→model mapping (today the platform's, since this ambient
  // flow has no userId in scope to resolve a BYOK provider for).
  tier: "sonnet",
  maxTokens: 2048,
  tools: [EMIT_TOOL],
  toolChoice: { type: "tool", name: EMIT_TOOL_NAME },
  // Ambient flow (stale-fingerprint re-distill, forkDaemon'd): hard-capped by
  // the background daily budget (Spec 83).
  trigger: "background",
});

// Route the forced-tool Sonnet call through the AiClient Layer (real
// retry/timeout, W-E3). The tool input is mojibake-repaired, then validated with
// the same Zod schema — failure channel kept as `BibleDistillError`.
const distillWithAi = (
  input: DistillInput,
  fingerprint: string,
): Effect.Effect<FilmBible, BibleDistillError, AiClient> =>
  Effect.gen(function* () {
    const ai = yield* AiClient;
    const result = yield* ai
      .callHaiku(buildCallParams(input), "bible-distill")
      .pipe(
        Effect.mapError((e) => new BibleDistillError("distillBible.sonnet", e)),
      );
    const raw = extractToolUse(result.content, EMIT_TOOL_NAME);
    const repaired = raw === null ? null : repairMojibakeDeep(raw);
    const parsed = FilmBibleSchema.safeParse({
      ...(repaired as object),
      sourceDocumentSnapshot: fingerprint,
    });
    return parsed.success
      ? parsed.data
      : yield* Effect.fail(
          new BibleDistillError("distillBible.parse", parsed.error),
        );
  });

const distillWithMock = (
  input: DistillInput,
  fingerprint: string,
): Effect.Effect<FilmBible, BibleDistillError> =>
  Effect.succeed(findFilmBibleFixture(input.projectMeta.title, fingerprint));

export const distillBibleEffect = (
  input: DistillInput,
  fingerprint: string,
): Effect.Effect<FilmBible, BibleDistillError, AiClient> =>
  process.env["MOCK_AI"] === "true"
    ? distillWithMock(input, fingerprint)
    : distillWithAi(input, fingerprint);

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

const dbRead = <A>(
  thunk: () => Promise<A>,
  operation: string,
): Effect.Effect<A, DbError> =>
  Effect.tryPromise({ try: thunk, catch: (e) => new DbError(operation, e) });

const loadProjectDistillData = (
  projectId: string,
): Effect.Effect<ProjectDistillData, DbError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;

    const [project] = yield* dbRead(
      () =>
        db
          .select({
            title: projects.title,
            genre: projects.genre,
            format: projects.format,
          })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1),
      "loadProjectDistillData.project",
    );

    if (!project) {
      return yield* Effect.fail(
        new DbError(
          "loadProjectDistillData",
          new Error(`Project not found: ${projectId}`),
        ),
      );
    }

    // The project header and the two independent reads below (the screenplay row
    // and the documents list) have no ordering dependency on each other, so they
    // run concurrently. Bounded to avoid more than this handful of in-flight
    // reads on the shared pool.
    const [screenplay, docs] = yield* Effect.all(
      [
        dbRead(
          () =>
            db
              .select({ id: screenplays.id })
              .from(screenplays)
              .where(eq(screenplays.projectId, projectId))
              .limit(1),
          "loadProjectDistillData.screenplay",
        ),
        dbRead(
          () =>
            db
              .select({
                id: documents.id,
                type: documents.type,
                content: documents.content,
                currentVersionId: documents.currentVersionId,
              })
              .from(documents)
              .where(eq(documents.projectId, projectId)),
          "loadProjectDistillData.documents",
        ),
      ],
      { concurrency: 2 },
    );

    // The logline is the `logline` document (single source of truth — spec
    // 47c), not a project column. Read it from the docs already loaded above.
    const loglineDoc = docs.find((d) => d.type === DocumentTypes.LOGLINE);
    const logline =
      loglineDoc && loglineDoc.content.trim().length > 0
        ? loglineDoc.content
        : null;

    return {
      screenplayId: screenplay[0]?.id ?? null,
      genre: project.genre ?? null,
      format: project.format,
      logline,
      title: project.title,
      documents: docs.map((d) => ({
        type: d.type,
        content: d.content,
        currentVersionId: d.currentVersionId,
      })),
    } satisfies ProjectDistillData;
  });

const loadDocumentContents = (
  docs: Array<{
    type: string;
    content: string;
    currentVersionId: string | null;
  }>,
): Effect.Effect<
  Array<{ type: string; content: string }>,
  DbError,
  DbService
> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const versionIds = docs
      .map((d) => d.currentVersionId)
      .filter((v): v is string => v !== null);

    const versionContentById = new Map<string, string>();
    if (versionIds.length > 0) {
      const rows = yield* dbRead(
        () =>
          db
            .select({
              id: documentVersions.id,
              content: documentVersions.content,
            })
            .from(documentVersions)
            .where(inArray(documentVersions.id, versionIds)),
        "loadDocumentContents",
      );
      for (const r of rows) versionContentById.set(r.id, r.content);
    }

    return docs
      .map((d) => ({
        type: d.type,
        content: d.currentVersionId
          ? (versionContentById.get(d.currentVersionId) ?? d.content)
          : d.content,
      }))
      .filter((d) => d.content.trim().length > 0);
  });

const loadSceneSummariesForBible = (
  screenplayId: string,
): Effect.Effect<
  { summaries: SceneSummary[]; fingerprints: string[] },
  DbError,
  DbService
> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const rows = yield* dbRead(
      () =>
        db
          .select({
            sceneSummary: scenes.sceneSummary,
            sceneSummaryFingerprint: scenes.sceneSummaryFingerprint,
          })
          .from(scenes)
          .where(eq(scenes.screenplayId, screenplayId)),
      "loadSceneSummariesForBible",
    );
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

const persistBible = (
  projectId: string,
  bible: FilmBible,
  fingerprint: string,
): Effect.Effect<void, DbError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    yield* dbRead(
      () =>
        db
          .insert(filmBibles)
          .values({ projectId, bible, fingerprint })
          .onConflictDoUpdate({
            target: filmBibles.projectId,
            set: { bible, fingerprint, updatedAt: new Date() },
          }),
      "persistBible",
    );
  });

// ─── Debounce ─────────────────────────────────────────────────────────────────

const distillInFlight = new Set<string>();

// ─── Load or distill ──────────────────────────────────────────────────────────

/**
 * Effect core of {@link loadFilmBible}. Return the current Film Bible:
 * - No row → distill synchronously (first-time setup).
 * - Fingerprint matches → return cached row immediately.
 * - Fingerprint mismatch → return existing row; re-distill in background
 *   (debounced, fire-and-forget — forked off the current fiber).
 *
 * Depends on `DbService` (db handle) + `AiClient` (the model client). The
 * background re-distill is `Effect.forkDaemon`'d so it outlives the request
 * fiber, mirroring the previous `void distill(...)` fire-and-forget.
 */
export const loadFilmBibleEffect = (
  projectId: string,
): Effect.Effect<
  FilmBible,
  DbError | BibleDistillError,
  DbService | AiClient
> =>
  Effect.gen(function* () {
    const projectData = yield* loadProjectDistillData(projectId);
    const screenplayId = projectData.screenplayId;

    // Scene summaries and document contents are independent reads — run them
    // concurrently. (Document contents only needs the docs list, already loaded;
    // scene summaries only needs the screenplayId.)
    const [summaryData, docContents] = yield* Effect.all(
      [
        screenplayId
          ? loadSceneSummariesForBible(screenplayId)
          : Effect.succeed({
              summaries: [] as SceneSummary[],
              fingerprints: [] as string[],
            }),
        loadDocumentContents(projectData.documents),
      ],
      { concurrency: 2 },
    );

    const docVersionIds = projectData.documents
      .map((d) => d.currentVersionId)
      .filter((v): v is string => v !== null);

    const fingerprint = computeBibleFingerprint(
      summaryData.fingerprints,
      docVersionIds,
      {
        genre: projectData.genre,
        format: projectData.format,
        logline: projectData.logline,
      },
    );

    const { db } = yield* DbService;
    const existing = yield* dbRead(
      () =>
        db
          .select()
          .from(filmBibles)
          .where(eq(filmBibles.projectId, projectId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      "loadFilmBible.find",
    );

    const input: DistillInput = {
      sceneSummaries: summaryData.summaries,
      documents: docContents,
      projectMeta: {
        title: projectData.title,
        genre: projectData.genre,
        format: projectData.format,
        logline: projectData.logline,
      },
    };

    const distillAndPersist = (): Effect.Effect<
      FilmBible,
      DbError | BibleDistillError,
      DbService | AiClient
    > =>
      distillBibleEffect(input, fingerprint).pipe(
        Effect.tap((bible) => persistBible(projectId, bible, fingerprint)),
      );

    if (!existing) {
      // First time — distill synchronously.
      return yield* distillAndPersist();
    }

    const cached = FilmBibleSchema.safeParse(existing.bible);
    if (!cached.success) {
      // Corrupted row — re-distill synchronously.
      return yield* distillAndPersist();
    }

    if (existing.fingerprint === fingerprint) {
      return cached.data;
    }

    // Fingerprint mismatch — return stale, background re-distill (debounced).
    if (!distillInFlight.has(projectId)) {
      distillInFlight.add(projectId);
      yield* Effect.forkDaemon(
        distillAndPersist().pipe(
          Effect.ensuring(
            Effect.sync(() => {
              distillInFlight.delete(projectId);
            }),
          ),
          Effect.ignore,
        ),
      );
    }

    return cached.data;
  });
