import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { okAsync } from "neverthrow";
import type { HaikuResult } from "~/features/ai";

// The classifier calls the neverthrow `callHaiku` from `~/features/ai`. We stub
// it so the test is deterministic and offline: it returns whatever JSON the
// current scenario sets. `extractText` is the real implementation re-exported.
const callHaikuMock = vi.fn();

vi.mock("~/features/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/features/ai")>();
  return {
    ...actual,
    callHaiku: (...args: unknown[]) => callHaikuMock(...args),
  };
});

import { classifyIntent } from "./cesare-intent-classifier";

const haikuJson = (json: string): HaikuResult => ({
  content: [{ type: "text", text: json }],
  stopReason: "end_turn",
});

const DOC_TOOLS = new Set([
  "write_logline",
  "propose_soggetto_v2",
  "propose_synopsis_from_screenplay",
  "propose_scaletta_from_soggetto",
  "propose_treatment_from_narrative",
]);

const SCREENPLAY_TOOLS = new Set([
  "propose_screenplay_edit",
  "propose_screenplay_revision",
  "rewrite_scene",
]);

beforeEach(() => {
  callHaikuMock.mockReset();
  // The classifier short-circuits under MOCK_AI; force the real path so the
  // stubbed callHaiku is exercised.
  vi.stubEnv("MOCK_AI", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyIntent — page routing (Bug #4)", () => {
  it("is a no-op on a page with no classifier prompt (budget)", async () => {
    const result = await classifyIntent({
      userMessage: "abbassa la voce del catering",
      page: "budget",
      availableTools: DOC_TOOLS,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
    expect(callHaikuMock).not.toHaveBeenCalled();
  });

  it("is a no-op under MOCK_AI even on a classifier page", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const result = await classifyIntent({
      userMessage: "scrivimi una logline su un detective",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
    expect(callHaikuMock).not.toHaveBeenCalled();
  });
});

describe("classifyIntent — document generation intents (Bug #4)", () => {
  it("maps a free logline request to write_logline on a document page", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_logline","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "scrivimi una logline su un detective che non dorme",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe("write_logline");
  });

  it("maps a free summary request to the synopsis generator", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_synopsis","confidence":0.9}')),
    );
    const result = await classifyIntent({
      userMessage: "fai un riassunto di cosa abbiamo scritto finora",
      page: "synopsis",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_synopsis_from_screenplay",
    );
  });

  it("maps a soggetto-from-logline request to propose_soggetto_v2", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_soggetto","confidence":0.92}')),
    );
    const result = await classifyIntent({
      userMessage: "genera il soggetto dalla logline",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe("propose_soggetto_v2");
  });

  it("maps a treatment request to propose_treatment_from_narrative (F-A2)", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_treatment","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "scrivi il trattamento dalla scaletta",
      page: "treatment",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_treatment_from_narrative",
    );
  });

  it("does NOT force a tool for a genuine chat question", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"question","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "di cosa parla la storia?",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });

  it("does NOT force a tool below the confidence threshold", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_outline","confidence":0.4}')),
    );
    const result = await classifyIntent({
      userMessage: "forse una scaletta?",
      page: "outline",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });

  it("does NOT force a tool absent from availableTools", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_outline","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "fammi la scaletta",
      page: "outline",
      // Outline generator deliberately not in the set.
      availableTools: new Set(["write_logline"]),
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });
});

describe("classifyIntent — screenplay intents still work", () => {
  it("maps a macro rewrite to propose_screenplay_revision", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"macro_rewrite","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "traduci tutta la sceneggiatura in inglese",
      page: "screenplay",
      availableTools: SCREENPLAY_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_screenplay_revision",
    );
  });
});
