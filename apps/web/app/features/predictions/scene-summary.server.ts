import { createHash } from "node:crypto";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { and, eq, isNull, or } from "drizzle-orm";
import { scenes } from "@oh-writers/db/schema";
import { SceneSummarySchema, type SceneSummary } from "@oh-writers/domain";
import { callHaiku, extractToolUse } from "~/features/ai";
import type { Db } from "~/server/db";
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

// ─── Fingerprint ──────────────────────────────────────────────────────────────

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

// ─── Core generation ─────────────────────────────────────────────────────────

const generateWithAI = (
  sceneNumber: number,
  heading: string,
  body: string,
): ResultAsync<SceneSummary, SceneSummaryError> =>
  callHaiku(
    {
      system: SYSTEM_PROMPT,
      fewShot: {},
      user: `SCENE ${sceneNumber}: ${heading}\n\n${body}`,
      maxTokens: 512,
      tools: [EMIT_TOOL],
      toolChoice: { type: "tool", name: EMIT_TOOL_NAME },
    },
    "generateSceneSummary",
  )
    .mapErr((e) => new SceneSummaryError("generateSceneSummary.haiku", e))
    .andThen((result) => {
      const raw = extractToolUse(result.content, EMIT_TOOL_NAME);
      const parsed = SceneSummarySchema.safeParse(raw);
      return parsed.success
        ? okAsync(parsed.data)
        : errAsync(
            new SceneSummaryError("generateSceneSummary.parse", parsed.error),
          );
    });

const generateWithMock = (
  sceneNumber: number,
  heading: string,
  _body: string,
): ResultAsync<SceneSummary, SceneSummaryError> =>
  okAsync(findSceneSummaryFixture(sceneNumber, heading));

export const generateSceneSummary = (
  sceneNumber: number,
  heading: string,
  body: string,
): ResultAsync<SceneSummary, SceneSummaryError> => {
  const startMs = Date.now();
  const result =
    process.env["MOCK_AI"] === "true"
      ? generateWithMock(sceneNumber, heading, body)
      : generateWithAI(sceneNumber, heading, body);
  return result
    .map((summary) => {
      console.info(
        JSON.stringify({
          event: "cesare.scene_summary.generated",
          sceneNumber,
          durationMs: Date.now() - startMs,
        }),
      );
      return summary;
    })
    .mapErr((err) => {
      logger.error(
        { err: err.message, sceneNumber },
        "scene summary generation failed",
      );
      return err;
    });
};

// ─── Debounce guard ───────────────────────────────────────────────────────────

// In-process debounce: don't start a second refresh while one is already running
// for the same screenplay. Simple Set — good enough for a single Node.js process.
const inFlight = new Set<string>();

// ─── Bulk refresh ────────────────────────────────────────────────────────────

type SceneRow = {
  id: string;
  number: number;
  heading: string;
  notes: string | null;
  sceneSummaryFingerprint: string | null;
};

/**
 * Find every scene in the screenplay whose body hash differs from the stored
 * fingerprint (or has no summary yet) and regenerate those summaries.
 * Fire-and-forget from the save path — errors are logged, not thrown.
 */
export const refreshStaleSceneSummaries = (
  db: Db,
  screenplayId: string,
): ResultAsync<number, DbError | SceneSummaryError> => {
  if (inFlight.has(screenplayId)) return okAsync(0);
  inFlight.add(screenplayId);

  return ResultAsync.fromPromise(
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
    (e) => new DbError("refreshStaleSceneSummaries.load", e),
  )
    .andThen((rows: SceneRow[]) => {
      const stale = rows.filter((r) => {
        if (!r.notes || r.notes.trim().length === 0) return false;
        const fp = fingerprintBody(r.notes);
        return r.sceneSummaryFingerprint !== fp;
      });

      if (stale.length === 0) return okAsync(0);

      const updates = stale.map((row) => {
        const fp = fingerprintBody(row.notes!);
        const prevFp = row.sceneSummaryFingerprint;
        return generateSceneSummary(
          row.number,
          row.heading,
          row.notes!,
        ).andThen((summary) =>
          // Anti-stale guard: only write if no previous summary exists or if
          // the stored fingerprint still matches what we read before generating
          // (another concurrent save may have already written a newer summary).
          ResultAsync.fromPromise(
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
            (e) => new DbError("refreshStaleSceneSummaries.update", e),
          ).map(() => 1 as const),
        );
      });

      return ResultAsync.combine(updates).map((results) =>
        results.reduce((sum, v) => sum + v, 0),
      );
    })
    .map((count) => {
      inFlight.delete(screenplayId);
      return count;
    })
    .mapErr((e) => {
      inFlight.delete(screenplayId);
      return e;
    });
};

// ─── Load summaries for distillation ─────────────────────────────────────────

export interface SceneSummaryWithFingerprint {
  readonly sceneId: string;
  readonly summary: SceneSummary;
  readonly fingerprint: string;
}

export const loadSceneSummaries = (
  db: Db,
  screenplayId: string,
): ResultAsync<SceneSummaryWithFingerprint[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        id: scenes.id,
        sceneSummary: scenes.sceneSummary,
        sceneSummaryFingerprint: scenes.sceneSummaryFingerprint,
      })
      .from(scenes)
      .where(eq(scenes.screenplayId, screenplayId)),
    (e) => new DbError("loadSceneSummaries", e),
  ).map((rows) =>
    rows
      .filter(
        (
          r,
        ): r is typeof r & {
          sceneSummary: unknown;
          sceneSummaryFingerprint: string;
        } => r.sceneSummary !== null && r.sceneSummaryFingerprint !== null,
      )
      .flatMap((r) => {
        const parsed = SceneSummarySchema.safeParse(r.sceneSummary);
        if (!parsed.success) return [];
        return [
          {
            sceneId: r.id,
            summary: parsed.data,
            fingerprint: r.sceneSummaryFingerprint,
          },
        ];
      }),
  );
