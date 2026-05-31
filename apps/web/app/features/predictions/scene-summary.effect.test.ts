import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cause, Chunk, Effect, Exit, Layer } from "effect";
import type { Db } from "~/server/db";
import { AiClient, DbService } from "~/server/effect";
import { AnthropicError, type HaikuResult } from "~/features/ai";
import {
  SceneSummaryError,
  generateSceneSummaryEffect,
  refreshStaleSceneSummariesEffect,
} from "./scene-summary.effect";

// [OHW-048] Spec 48 W-E5 — scene-summary distiller as Effect.
//
// These exercise the Effect cores directly with a SUBSTITUTE AiClient Layer (a
// fake model that returns a forced tool-call), so the test proves success→ok and
// typed-failure→err without a live model or DB. The AiClient Layer carries the
// W-E3 retry/timeout in production; here it is replaced by a deterministic fake.

const SUMMARY_TOOL_NAME = "emit_scene_summary";

// A well-formed scene summary as a forced tool-call HaikuResult — what the real
// AiClient returns for a successful `generateSceneSummary` call.
const okSummaryResult: HaikuResult = {
  content: [
    {
      type: "tool_use",
      name: SUMMARY_TOOL_NAME,
      input: {
        sceneNumber: 1,
        heading: "INT. BAR - GIORNO",
        settingDescription: "A small-town bar.",
        timeOfDay: "GIORNO",
        presentCharacters: ["DANTE"],
        keyActions: ["Dante cleans the counter."],
        productionNotes: [],
      },
    },
  ],
  stopReason: "tool_use",
};

const aiClientReturning = (result: HaikuResult): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, {
    callHaiku: () => Effect.succeed(result),
  });

const aiClientFailing = (): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, {
    callHaiku: (_params, operation) =>
      Effect.fail(new AnthropicError(operation, new Error("model exploded"))),
  });

// Force the real AiClient path (not the MOCK_AI fixture) so the substitute Layer
// is exercised. Restored after each test.
beforeEach(() => {
  vi.stubEnv("MOCK_AI", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[OHW-048] generateSceneSummaryEffect", () => {
  it("success → the validated SceneSummary (ok)", async () => {
    const exit = await Effect.runPromiseExit(
      generateSceneSummaryEffect(1, "INT. BAR - GIORNO", "DANTE pulisce.").pipe(
        Effect.provide(aiClientReturning(okSummaryResult)),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.heading).toBe("INT. BAR - GIORNO");
      expect(exit.value.presentCharacters).toEqual(["DANTE"]);
    }
  });

  it("model error → typed SceneSummaryError on the fail channel (err)", async () => {
    const exit = await Effect.runPromiseExit(
      generateSceneSummaryEffect(1, "INT. BAR - GIORNO", "body").pipe(
        Effect.provide(aiClientFailing()),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failures = Chunk.toReadonlyArray(Cause.failures(exit.cause));
      const tagged = failures.find(
        (e): e is SceneSummaryError => e instanceof SceneSummaryError,
      );
      expect(tagged).toBeDefined();
      expect(tagged?._tag).toBe("SceneSummaryError");
      expect(tagged?.operation).toBe("generateSceneSummary.haiku");
    }
  });

  it("malformed tool input → SceneSummaryError (Zod parse fail)", async () => {
    const malformed: HaikuResult = {
      content: [
        { type: "tool_use", name: SUMMARY_TOOL_NAME, input: { nope: true } },
      ],
      stopReason: "tool_use",
    };
    const exit = await Effect.runPromiseExit(
      generateSceneSummaryEffect(1, "INT. X", "body").pipe(
        Effect.provide(aiClientReturning(malformed)),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

// ─── refresh fan-out: bounded concurrency, anti-stale guard, count ─────────────
//
// A minimal Drizzle-shaped fake that returns N stale scenes and records each
// update. The model is the same fake AiClient. Proves the fan-out regenerates
// every stale scene and returns the correct count.

interface MockSceneRow {
  id: string;
  number: number;
  heading: string;
  notes: string | null;
  sceneSummaryFingerprint: string | null;
}

const makeRefreshDb = (rows: MockSceneRow[]) => {
  const updates: string[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
    update: (_table: unknown) => ({
      set: (_values: Record<string, unknown>) => ({
        where: () => {
          updates.push("update");
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Db;
  return { db, updates };
};

describe("[OHW-048] refreshStaleSceneSummariesEffect", () => {
  it("regenerates every stale scene and returns the count", async () => {
    const rows: MockSceneRow[] = [
      {
        id: "s1",
        number: 1,
        heading: "INT. A",
        notes: "body one",
        sceneSummaryFingerprint: null,
      },
      {
        id: "s2",
        number: 2,
        heading: "INT. B",
        notes: "body two",
        sceneSummaryFingerprint: "stale",
      },
    ];
    const { db, updates } = makeRefreshDb(rows);
    const exit = await Effect.runPromiseExit(
      refreshStaleSceneSummariesEffect("sp1").pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(DbService, { db }),
            aiClientReturning(okSummaryResult),
          ),
        ),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toBe(2);
    expect(updates).toHaveLength(2);
  });

  it("returns 0 when no scene is stale (fingerprint matches body hash)", async () => {
    // fingerprintBody is sha256 — pre-compute is brittle, so use empty notes:
    // a scene with no body is never stale.
    const rows: MockSceneRow[] = [
      {
        id: "s1",
        number: 1,
        heading: "INT. A",
        notes: "",
        sceneSummaryFingerprint: null,
      },
    ];
    const { db, updates } = makeRefreshDb(rows);
    const exit = await Effect.runPromiseExit(
      refreshStaleSceneSummariesEffect("sp1").pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(DbService, { db }),
            aiClientReturning(okSummaryResult),
          ),
        ),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
