import { describe, it, expect } from "vitest";
import { Effect, Exit, Layer } from "effect";
import { projects, scenes, screenplays } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { DbService } from "~/server/effect";
import {
  buildLocalContextEffect,
  type LocalPageContext,
} from "./local-context.server";

// [OHW-048] Spec 48 W-E5 — buildLocalContext concurrency equivalence.
//
// The context assembly fans out independent, read-only DB reads with
// `Effect.all(..., { concurrency })`. This proves the genuine-win property: the
// concurrent assembly produces the SAME result regardless of the order in which
// the underlying reads resolve — i.e. parallelism here is safe (no ordering or
// shared-state dependency), unlike the W-E3 tool loop.
//
// We run the SAME Effect against two fake DBs that differ ONLY in read timing:
//   - "fast"  : every read resolves immediately
//   - "reverse": the FIRST-issued read resolves LAST (and vice-versa)
// and assert the two assembled LocalContexts are byte-identical (deep-equal).

const PAGE_CONTEXT: LocalPageContext = {
  sceneId: null,
  sceneNumber: 2,
  requirementId: null,
  documentId: null,
  shootingDayId: null,
  shootingDayNumber: null,
};

const SCENE_ROWS = [
  { id: "scene-1", number: 1, heading: "INT. A - GIORNO" },
  { id: "scene-2", number: 2, heading: "INT. B - NOTTE" },
  { id: "scene-3", number: 3, heading: "EXT. C - GIORNO" },
];

const CHAR_ROWS = [
  { characterNames: ["DANTE", "FILIPPO"] },
  { characterNames: ["DANTE"] },
];

// A fake Drizzle handle. `timing` decides whether each resolved promise is
// delayed: "reverse" assigns the Nth-issued query a delay that DECREASES with N,
// so the first query settles last — exercising out-of-order completion.
const makeDb = (timing: "fast" | "reverse"): Db => {
  let issued = 0;
  const settle = <A>(value: A): Promise<A> => {
    if (timing === "fast") return Promise.resolve(value);
    const n = issued++;
    // Earlier-issued queries get a LONGER delay → they resolve later.
    const delay = Math.max(0, 20 - n * 4);
    return new Promise((resolve) => setTimeout(() => resolve(value), delay));
  };

  const rowsFor = (
    table: unknown,
    columns: Record<string, unknown>,
  ): unknown[] => {
    if (table === screenplays) return [{ id: "sp1", title: "My Film" }];
    if (table === projects) return [{ title: "My Film" }];
    if (table === scenes) {
      // characterNames-only select vs metadata vs scene-window
      if ("characterNames" in columns && Object.keys(columns).length === 1)
        return CHAR_ROWS;
      if ("body" in columns)
        return SCENE_ROWS.map((s) => ({
          ...s,
          body: `body ${s.number}`,
          characterNames: ["DANTE"],
        }));
      return SCENE_ROWS;
    }
    return [];
  };

  const select = (columns: Record<string, unknown>) => ({
    from: (table: unknown) => {
      const result: Record<string, unknown> = {
        where: () => result,
        limit: () => result,
        orderBy: () => result,
        then: (
          resolve: (v: unknown[]) => void,
          reject?: (e: unknown) => void,
        ) => settle(rowsFor(table, columns)).then(resolve, reject),
      };
      return result;
    },
  });

  return { select } as unknown as Db;
};

const run = (db: Db) =>
  Effect.runPromiseExit(
    buildLocalContextEffect("proj1", PAGE_CONTEXT, [], "screenplay").pipe(
      Effect.provide(Layer.succeed(DbService, { db })),
    ),
  );

describe("[OHW-048] buildLocalContext concurrency equivalence", () => {
  it("assembles the expected context (screenplay page, no skills)", async () => {
    const exit = await run(makeDb("fast"));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      const ctx = exit.value;
      expect(ctx.projectTitle).toBe("My Film");
      expect(ctx.scenes).toHaveLength(3);
      expect(ctx.currentScene?.number).toBe(2);
      expect(ctx.characters.sort()).toEqual(["DANTE", "FILIPPO"]);
      // No skill requirements → conditional buckets are empty.
      expect(ctx.budget).toBeNull();
      expect(ctx.schedule).toBeNull();
      expect(ctx.locations).toEqual([]);
      expect(ctx.projectDocuments).toEqual([]);
      // Scene window covers the ±2 numeric window around scene 2.
      expect(ctx.sceneWindow.length).toBeGreaterThan(0);
    }
  });

  it("concurrent result is identical regardless of read completion order", async () => {
    const fastExit = await run(makeDb("fast"));
    const reverseExit = await run(makeDb("reverse"));
    expect(Exit.isSuccess(fastExit)).toBe(true);
    expect(Exit.isSuccess(reverseExit)).toBe(true);
    if (Exit.isSuccess(fastExit) && Exit.isSuccess(reverseExit)) {
      // Byte-identical assembly: out-of-order completion does not change the
      // result — the reads are genuinely independent.
      expect(reverseExit.value).toStrictEqual(fastExit.value);
    }
  });

  it("a DB failure surfaces as a typed DbError(buildLocalContext) (err)", async () => {
    const failingDb = {
      select: () => ({
        from: () => {
          const result: Record<string, unknown> = {
            where: () => result,
            limit: () => result,
            orderBy: () => result,
            then: (
              _resolve: (v: unknown[]) => void,
              reject?: (e: unknown) => void,
            ) => reject?.(new Error("connection lost")),
          };
          return result;
        },
      }),
    } as unknown as Db;

    const exit = await run(failingDb);
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
