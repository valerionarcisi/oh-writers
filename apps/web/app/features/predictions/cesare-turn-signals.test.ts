import { describe, it, expect } from "vitest";
import {
  openTurnSignalsScope,
  setTurnClassifiedIntent,
  getTurnClassifiedIntent,
  getTurnVersionDirective,
  recordTurnToolExecution,
  getTurnExecutedToolNames,
  runWithTurnSignalsScope,
} from "./cesare-turn-signals";

describe("cesare-turn-signals (#119)", () => {
  // Declared FIRST: enterWith in later tests can bleed into the runner's async
  // frame, so the clean-context assertion must run before any scope opens.
  it("outside any scope, reads return null/empty and writes are no-ops", () => {
    setTurnClassifiedIntent({ type: "question", confidence: 0.9 });
    recordTurnToolExecution("ghost_tool");
    expect(getTurnClassifiedIntent()).toBeNull();
    expect(getTurnVersionDirective()).toBeNull();
    expect(getTurnExecutedToolNames()).toEqual([]);
  });

  it("an intent set inside the plan chain is visible to tool closures executing later", async () => {
    // Mirrors handleAskCesareV2: scope opened synchronously, cell filled by an
    // async classifier resolution, read by a tool executing after the await.
    const turn = async () => {
      openTurnSignalsScope();
      await Promise.resolve().then(() => {
        setTurnClassifiedIntent({
          type: "write_soggetto",
          confidence: 0.9,
          versionDirective: "mint",
        });
      });
      await Promise.resolve();
      return getTurnVersionDirective();
    };
    expect(await turn()).toBe("mint");
  });

  it("two interleaved turns never share a cell", async () => {
    const turn = async (
      directive: "mint" | "overwrite",
      delayMs: number,
    ): Promise<string | null> => {
      openTurnSignalsScope();
      setTurnClassifiedIntent({
        type: "write_soggetto",
        confidence: 0.9,
        versionDirective: directive,
      });
      await new Promise((r) => setTimeout(r, delayMs));
      return getTurnVersionDirective();
    };
    const [a, b] = await Promise.all([turn("mint", 20), turn("overwrite", 5)]);
    expect(a).toBe("mint");
    expect(b).toBe("overwrite");
  });

  it("getTurnVersionDirective is null when the intent has no directive", () => {
    runWithTurnSignalsScope(() => {
      setTurnClassifiedIntent({ type: "question", confidence: 0.5 });
      expect(getTurnClassifiedIntent()?.type).toBe("question");
      expect(getTurnVersionDirective()).toBeNull();
    });
  });
});

describe("cesare-turn-signals — executed tool recording (#118)", () => {
  it("records executions inside a scope and reads them back after awaits", async () => {
    const turn = async () => {
      openTurnSignalsScope();
      await Promise.resolve().then(() => {
        recordTurnToolExecution("read_document");
        recordTurnToolExecution("transform_document");
      });
      await Promise.resolve();
      return getTurnExecutedToolNames();
    };
    expect(await turn()).toEqual(["read_document", "transform_document"]);
  });
});
