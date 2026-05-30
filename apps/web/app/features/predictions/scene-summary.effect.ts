// apps/web/app/features/predictions/scene-summary.effect.ts
//
// Spec 48 (W-E5) — the scene-summary distiller as an Effect.
//
// Circle 2 of ADR 48: an LLM+DB distiller. The model call is routed through the
// `AiClient` Layer (so it inherits the real retry/timeout policy from W-E3
// instead of calling `callHaiku` raw), `db` comes from the `DbService` Layer
// instead of being threaded by hand, and the bulk-refresh fan-out runs as an
// Effect graph with bounded concurrency.
//
// The external contract is UNCHANGED: `scene-summary.server.ts` re-exports
// `ResultAsync`-returning wrappers built on top of these Effects via
// `toResultAsync`, so the only caller (`screenplay.server.ts`) is untouched.
// The pure `fingerprintBody` and the Zod validation stay exactly as they were.

import { createHash } from "node:crypto";
import { Effect } from "effect";
import { and, eq, isNull } from "drizzle-orm";
import { scenes } from "@oh-writers/db/schema";
import { SceneSummarySchema, type SceneSummary } from "@oh-writers/domain";
import { extractToolUse, type CallHaikuParams } from "~/features/ai";
import { AiClient, DbService } from "~/server/effect";
import { DbError } from "@oh-writers/utils";
import { findSceneSummaryFixture } from "./_mocks/scene-summary.fixtures";
import { logger } from "~/server/logger";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class SceneSummaryError {
  readonly _tag = "SceneSummaryError" as const;
  readonly message: string;
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    this.message = `Scene summary failed in ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

// ─── Fingerprint (pure — unchanged) ────────────────────────────────────────────

export const fingerprintBody = (body: string): string =>
  createHash("sha256").update(body).digest("hex").slice(0, 16);

// ─── Tool definition ──────────────────────────────────────────────────────────

const EMIT_TOOL_NAME = "emit_scene_summary";

const EMIT_TOOL = {
  name: EMIT_TOOL_NAME,
  description: "Emit a structured summary of the screenplay scene.",
  input_schema: {
    type: "object",
    properties: {
      sceneNumber: { type: "integer", minimum: 1 },
      heading: { type: "string" },
      settingDescription: { type: "string" },
      timeOfDay: { type: ["string", "null"] },
      presentCharacters: {
        type: "array",
        items: { type: "string" },
        maxItems: 20,
      },
      keyActions: { type: "array", items: { type: "string" }, maxItems: 5 },
      productionNotes: {
        type: "array",
        items: { type: "string" },
        maxItems: 10,
      },
    },
    required: [
      "sceneNumber",
      "heading",
      "settingDescription",
      "timeOfDay",
      "presentCharacters",
      "keyActions",
      "productionNotes",
    ],
  },
} as const;

const SYSTEM_PROMPT = `You are a film production analyst.
Given the Fountain-formatted body of a screenplay scene, emit a structured JSON summary
that captures the physical setting, characters present, the key dramatic actions (≤5 bullets),
and any production notes that affect logistics (stunts, SFX, vehicles, night exterior, etc.).
Be concise. The settingDescription should be a 1-sentence description of the physical place.`;

// ─── Core generation ──────────────────────────────────────────────────────────

const buildCallParams = (
  sceneNumber: number,
  heading: string,
  body: string,
): CallHaikuParams => ({
  system: SYSTEM_PROMPT,
  fewShot: {},
  user: `SCENE ${sceneNumber}: ${heading}\n\n${body}`,
  maxTokens: 512,
  tools: [EMIT_TOOL],
  toolChoice: { type: "tool", name: EMIT_TOOL_NAME },
});

// Route the model call through the AiClient Layer (real retry/timeout, W-E3),
// then validate with the same Zod schema. The model error is re-tagged into the
// feature's `SceneSummaryError`, keeping the failure channel byte-identical.
const generateWithAi = (
  sceneNumber: number,
  heading: string,
  body: string,
): Effect.Effect<SceneSummary, SceneSummaryError, AiClient> =>
  Effect.gen(function* () {
    const ai = yield* AiClient;
    const result = yield* ai
      .callHaiku(
        buildCallParams(sceneNumber, heading, body),
        "generateSceneSummary",
      )
      .pipe(
        Effect.mapError(
          (e) => new SceneSummaryError("generateSceneSummary.haiku", e),
        ),
      );
    const raw = extractToolUse(result.content, EMIT_TOOL_NAME);
    const parsed = SceneSummarySchema.safeParse(raw);
    return parsed.success
      ? parsed.data
      : yield* Effect.fail(
          new SceneSummaryError("generateSceneSummary.parse", parsed.error),
        );
  });

const generateWithMock = (
  sceneNumber: number,
  heading: string,
): Effect.Effect<SceneSummary, SceneSummaryError> =>
  Effect.succeed(findSceneSummaryFixture(sceneNumber, heading));

/**
 * Generate one structured scene summary. Mirror of the previous neverthrow
 * `generateSceneSummary`: mock fixture when `MOCK_AI=true`, otherwise the model
 * call (now via the AiClient Layer). Same logging side effects, same Zod
 * validation, same typed error.
 */
export const generateSceneSummaryEffect = (
  sceneNumber: number,
  heading: string,
  body: string,
): Effect.Effect<SceneSummary, SceneSummaryError, AiClient> => {
  const startMs = Date.now();
  const core =
    process.env["MOCK_AI"] === "true"
      ? generateWithMock(sceneNumber, heading)
      : generateWithAi(sceneNumber, heading, body);
  return core.pipe(
    Effect.tap((_summary) =>
      Effect.sync(() => {
        console.info(
          JSON.stringify({
            event: "cesare.scene_summary.generated",
            sceneNumber,
            durationMs: Date.now() - startMs,
          }),
        );
      }),
    ),
    Effect.tapError((err) =>
      Effect.sync(() => {
        logger.error(
          { err: err.message, sceneNumber },
          "scene summary generation failed",
        );
      }),
    ),
  );
};

// ─── Bulk refresh ──────────────────────────────────────────────────────────────

type SceneRow = {
  id: string;
  number: number;
  heading: string;
  notes: string | null;
  sceneSummaryFingerprint: string | null;
};

// Generate one scene's summary and write it back, with the anti-stale guard:
// only write if no previous summary exists or the stored fingerprint still
// matches what we read before generating (a concurrent save may have written a
// newer one). Returns 1 on a successful write (the unit summed by the caller).
const refreshOneScene = (
  row: SceneRow,
): Effect.Effect<number, DbError | SceneSummaryError, AiClient | DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const fp = fingerprintBody(row.notes!);
    const prevFp = row.sceneSummaryFingerprint;
    const summary = yield* generateSceneSummaryEffect(
      row.number,
      row.heading,
      row.notes!,
    );
    yield* Effect.tryPromise({
      try: () =>
        db
          .update(scenes)
          .set({
            sceneSummary: summary,
            sceneSummaryFingerprint: fp,
          })
          .where(
            and(
              eq(scenes.id, row.id),
              prevFp === null
                ? isNull(scenes.sceneSummaryFingerprint)
                : eq(scenes.sceneSummaryFingerprint, prevFp),
            ),
          ),
      catch: (e) => new DbError("refreshStaleSceneSummaries.update", e),
    });
    return 1;
  });

// Bounded concurrency for the per-scene refresh fan-out: each scene is an
// independent model call + write (no ordering / shared-state dependency), so
// they run in parallel up to `REFRESH_CONCURRENCY`. The bound caps how many
// model calls fly at once, keeping the AiClient retry budget and provider
// rate-limit under control while still removing the sequential waterfall.
const REFRESH_CONCURRENCY = 4;

/**
 * Effect core of {@link refreshStaleSceneSummaries}: load every scene of the
 * screenplay, keep the ones whose body hash differs from the stored fingerprint,
 * and regenerate those summaries with bounded concurrency. Returns the count of
 * summaries rewritten. The in-flight debounce stays in the `.server.ts` wrapper
 * (process-level guard, not part of the Effect graph).
 */
export const refreshStaleSceneSummariesEffect = (
  screenplayId: string,
): Effect.Effect<number, DbError | SceneSummaryError, AiClient | DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const rows = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: scenes.id,
            number: scenes.number,
            heading: scenes.heading,
            notes: scenes.notes,
            sceneSummaryFingerprint: scenes.sceneSummaryFingerprint,
          })
          .from(scenes)
          .where(eq(scenes.screenplayId, screenplayId)),
      catch: (e) => new DbError("refreshStaleSceneSummaries.load", e),
    });

    const stale = (rows as SceneRow[]).filter((r) => {
      if (!r.notes || r.notes.trim().length === 0) return false;
      const fp = fingerprintBody(r.notes);
      return r.sceneSummaryFingerprint !== fp;
    });

    if (stale.length === 0) return 0;

    const counts = yield* Effect.all(stale.map(refreshOneScene), {
      concurrency: REFRESH_CONCURRENCY,
    });
    return counts.reduce((sum, v) => sum + v, 0);
  });
