import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cause, Chunk, Effect, Exit, Layer } from "effect";
import {
  documents,
  filmBibles,
  projects,
  scenes,
  screenplays,
} from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { AiClient, DbService } from "~/server/effect";
import { AnthropicError, type HaikuResult } from "~/features/ai";
import {
  BibleDistillError,
  computeBibleFingerprint,
  distillBibleEffect,
  loadFilmBibleEffect,
} from "./bible-distill.effect";

// [OHW-048] Spec 48 W-E5 — Film Bible distiller as Effect.
//
// The Sonnet forced-tool call now goes through the AiClient Layer (real
// retry/timeout in prod, a deterministic fake here). DB comes from the DbService
// Layer. These tests prove success→ok, typed-fail→err, and the cache-hit path
// (fingerprint match → cached row, no distillation).

const BIBLE_TOOL_NAME = "emit_film_bible";

const okBibleResult: HaikuResult = {
  content: [
    {
      type: "tool_use",
      name: BIBLE_TOOL_NAME,
      input: {
        settingSummary: "A small-town restaurant.",
        genreAndTone: "Dramedy, warm.",
        centralConflict: "A failing family business.",
        productionConstraints: ["mostly interiors"],
        recurringLocations: [
          {
            canonicalName: "Ristorante da Dante",
            aliases: ["Bancone", "Sala"],
            locationType: "restaurant",
            sceneCount: 5,
            settingPrior: "small-town restaurant, Marche region, Italy",
          },
        ],
        keyCharacters: [{ name: "Dante", role: "owner", arc: "lets go" }],
      },
    },
  ],
  stopReason: "tool_use",
};

const aiReturning = (result: HaikuResult): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, { callHaiku: () => Effect.succeed(result) });

const aiFailing = (): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, {
    callHaiku: (_p, op) =>
      Effect.fail(new AnthropicError(op, new Error("boom"))),
  });

// A model that throws if called — used to prove the cache-hit path never
// distills.
const aiNeverCalled = (): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, {
    callHaiku: () => Effect.die(new Error("AiClient must not be called")),
  });

const distillInput = {
  sceneSummaries: [],
  documents: [{ type: "synopsis", content: "Una storia." }],
  projectMeta: {
    title: "Da Dante",
    genre: "dramedy",
    format: "feature",
    logline: "Un ristorante in crisi.",
  },
} as const;

beforeEach(() => {
  vi.stubEnv("MOCK_AI", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[OHW-048] distillBibleEffect", () => {
  it("success → validated FilmBible carrying the fingerprint (ok)", async () => {
    const exit = await Effect.runPromiseExit(
      distillBibleEffect(distillInput, "fp123").pipe(
        Effect.provide(aiReturning(okBibleResult)),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.sourceDocumentSnapshot).toBe("fp123");
      expect(exit.value.recurringLocations[0]?.canonicalName).toBe(
        "Ristorante da Dante",
      );
    }
  });

  it("model error → typed BibleDistillError (err)", async () => {
    const exit = await Effect.runPromiseExit(
      distillBibleEffect(distillInput, "fp123").pipe(
        Effect.provide(aiFailing()),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failures = Chunk.toReadonlyArray(Cause.failures(exit.cause));
      const tagged = failures.find(
        (e): e is BibleDistillError => e instanceof BibleDistillError,
      );
      expect(tagged?._tag).toBe("BibleDistillError");
      expect(tagged?.operation).toBe("distillBible.sonnet");
    }
  });

  it("malformed tool input → BibleDistillError (parse fail)", async () => {
    const malformed: HaikuResult = {
      content: [{ type: "tool_use", name: BIBLE_TOOL_NAME, input: {} }],
      stopReason: "tool_use",
    };
    const exit = await Effect.runPromiseExit(
      distillBibleEffect(distillInput, "fp").pipe(
        Effect.provide(aiReturning(malformed)),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

// ─── loadFilmBibleEffect: cache-hit path never distills ───────────────────────
//
// A Drizzle-shaped fake keyed by the table object. When the stored fingerprint
// matches the computed one, the cached bible is returned and the model is never
// called (asserted via aiNeverCalled, which dies if invoked).

const makeLoadDb = (opts: {
  storedBible: unknown;
  storedFingerprint: string;
}): Db => {
  const select = () => ({
    from: (table: unknown) => {
      const rows = (): unknown[] => {
        if (table === projects)
          return [{ title: "Da Dante", genre: "dramedy", format: "feature" }];
        if (table === screenplays) return [{ id: "sp1" }];
        if (table === documents) return [];
        if (table === scenes) return [];
        if (table === filmBibles)
          return [
            {
              bible: opts.storedBible,
              fingerprint: opts.storedFingerprint,
            },
          ];
        return [];
      };
      // A genuine thenable: `then` returns a real Promise so `.then(mapFn)`
      // chains correctly (the `loadFilmBible.find` query does
      // `.limit(1).then((rows) => rows[0] ?? null)`).
      const result: Record<string, unknown> = {
        where: () => result,
        limit: () => result,
        orderBy: () => result,
        then: (
          resolve: (v: unknown[]) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(rows()).then(resolve, reject),
      };
      return result;
    },
  });
  return { select } as unknown as Db;
};

describe("[OHW-048] loadFilmBibleEffect cache hit", () => {
  it("fingerprint match → returns cached bible, never calls the model", async () => {
    // No docs and no scene summaries → fingerprint over ("", "", meta).
    const fingerprint = computeBibleFingerprint([], [], {
      genre: "dramedy",
      format: "feature",
      logline: null,
    });
    const storedBible = {
      schemaVersion: "1",
      settingSummary: "cached",
      genreAndTone: "warm",
      centralConflict: "x",
      productionConstraints: [],
      recurringLocations: [],
      keyCharacters: [],
      sourceDocumentSnapshot: fingerprint,
    };
    const db = makeLoadDb({ storedBible, storedFingerprint: fingerprint });
    const exit = await Effect.runPromiseExit(
      loadFilmBibleEffect("proj1").pipe(
        Effect.provide(
          Layer.mergeAll(Layer.succeed(DbService, { db }), aiNeverCalled()),
        ),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.settingSummary).toBe("cached");
    }
  });
});
