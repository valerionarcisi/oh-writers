import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cause, Chunk, Effect, Exit } from "effect";
import { LlmSpoglioFailedError } from "../breakdown.errors";
import { runMockSpoglio } from "./llm-spoglio.server";
import type { ParsedSceneRaw } from "../lib/parse-scene-stream";

// [OHW-048] Spec 48 W-E6 — the streamed spoglio modelled as an Effect.
//
// The streaming Sonnet transport stays the raw SDK; the Effect adds a bounded
// timeout + typed failure. Here we exercise the MOCK path (no live model, no
// network) to prove: success → ok (every scene drained into the sink), and a
// sink failure → typed `LlmSpoglioFailedError` on the fail channel. The real
// streaming path is covered live via Playwright (MOCK_AI breakdown spoglio).

const SCENES = [
  { sceneNumber: 1, heading: "INT. BAR - GIORNO", body: "Dante pulisce." },
  { sceneNumber: 2, heading: "EXT. STRADA - NOTTE", body: "Pioggia." },
];

beforeEach(() => {
  vi.stubEnv("MOCK_AI", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[OHW-048] runMockSpoglio", () => {
  it("success → drains every parsed scene into the sink (ok)", async () => {
    const seen: number[] = [];
    const sink = async (parsed: ParsedSceneRaw): Promise<void> => {
      seen.push(parsed.sceneNumber);
    };
    const exit = await Effect.runPromiseExit(runMockSpoglio(SCENES, sink));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("a sink failure → typed LlmSpoglioFailedError on the fail channel (err)", async () => {
    const sink = async (): Promise<void> => {
      throw new Error("db write blew up");
    };
    const exit = await Effect.runPromiseExit(runMockSpoglio(SCENES, sink));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const tagged = Chunk.toReadonlyArray(Cause.failures(exit.cause)).find(
        (e): e is LlmSpoglioFailedError => e instanceof LlmSpoglioFailedError,
      );
      expect(tagged?._tag).toBe("LlmSpoglioFailedError");
      expect(tagged?.message).toContain("db write blew up");
    }
  });
});
