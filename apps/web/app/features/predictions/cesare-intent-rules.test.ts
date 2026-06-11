import { describe, it, expect } from "vitest";
import {
  DOCUMENT_SYSTEM_PROMPT,
  SCREENPLAY_SYSTEM_PROMPT,
  TOOL_BY_INTENT,
  parseIntentJson,
  promptForPage,
  resolveSuggestedTool,
} from "./cesare-intent-rules";

// BUG-N67 — these tests pin the deterministic routing layer: a request that
// NAMES the sceneggiatura must resolve to the screenplay first-draft tool, not
// to the treatment generator, from the soggetto context and from a session.

const DOCUMENT_PAGE_TOOLS = new Set([
  "write_logline",
  "propose_soggetto_v2",
  "propose_synopsis_from_screenplay",
  "propose_scaletta_from_soggetto",
  "propose_treatment_from_narrative",
  "propose_screenplay_from_narrative",
]);

describe("TOOL_BY_INTENT — screenplay first draft (BUG-N67)", () => {
  it("maps write_screenplay to the screenplay first-draft tool", () => {
    expect(TOOL_BY_INTENT["write_screenplay"]).toBe(
      "propose_screenplay_from_narrative",
    );
  });

  it("keeps write_treatment mapped to the treatment generator (no overlap)", () => {
    expect(TOOL_BY_INTENT["write_treatment"]).toBe(
      "propose_treatment_from_narrative",
    );
  });
});

describe("parseIntentJson — write_screenplay is a valid intent", () => {
  it("accepts write_screenplay", () => {
    const parsed = parseIntentJson(
      '{"type":"write_screenplay","confidence":0.95}',
    );
    expect(parsed).toEqual({ type: "write_screenplay", confidence: 0.95 });
  });

  it("accepts write_screenplay inside a code fence", () => {
    const parsed = parseIntentJson(
      '```json\n{"type":"write_screenplay","confidence":0.9}\n```',
    );
    expect(parsed?.type).toBe("write_screenplay");
  });

  it("rejects an unknown intent type", () => {
    expect(parseIntentJson('{"type":"write_film","confidence":0.9}')).toBe(
      null,
    );
  });

  it("rejects malformed JSON", () => {
    expect(parseIntentJson("non-json output")).toBe(null);
  });

  it("clamps out-of-range confidence", () => {
    const parsed = parseIntentJson(
      '{"type":"write_screenplay","confidence":1.7}',
    );
    expect(parsed?.confidence).toBe(1);
  });
});

describe("resolveSuggestedTool — entity routing from the soggetto context", () => {
  it("routes a confident write_screenplay to the screenplay tool, NOT the treatment", () => {
    const resolved = resolveSuggestedTool(
      { type: "write_screenplay", confidence: 0.95 },
      DOCUMENT_PAGE_TOOLS,
    );
    expect(resolved.suggestedTool).toBe("propose_screenplay_from_narrative");
    expect(resolved.suggestedTool).not.toBe("propose_treatment_from_narrative");
  });

  it("still routes write_treatment to the treatment generator", () => {
    const resolved = resolveSuggestedTool(
      { type: "write_treatment", confidence: 0.95 },
      DOCUMENT_PAGE_TOOLS,
    );
    expect(resolved.suggestedTool).toBe("propose_treatment_from_narrative");
  });

  it("does not force a tool below the confidence threshold", () => {
    const resolved = resolveSuggestedTool(
      { type: "write_screenplay", confidence: 0.4 },
      DOCUMENT_PAGE_TOOLS,
    );
    expect(resolved.suggestedTool).toBeUndefined();
  });

  it("does not force a tool absent from the page's available set", () => {
    const resolved = resolveSuggestedTool(
      { type: "write_screenplay", confidence: 0.95 },
      new Set(["write_logline"]),
    );
    expect(resolved.suggestedTool).toBeUndefined();
  });

  it("never forces a tool for a question", () => {
    const resolved = resolveSuggestedTool(
      { type: "question", confidence: 0.99 },
      DOCUMENT_PAGE_TOOLS,
    );
    expect(resolved.suggestedTool).toBeUndefined();
  });
});

describe("classifier prompts — the screenplay is a nameable entity (BUG-N67)", () => {
  it("document-page prompt offers write_screenplay in the JSON schema", () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toContain('"write_screenplay"');
  });

  it("document-page prompt teaches the bug phrasing as a few-shot example", () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toContain(
      "prima stesura della sceneggiatura",
    );
  });

  it("both prompts carry the entity-fidelity rule (named entity wins)", () => {
    for (const prompt of [DOCUMENT_SYSTEM_PROMPT, SCREENPLAY_SYSTEM_PROMPT]) {
      expect(prompt).toContain("NOMINA vince SEMPRE");
      expect(prompt).toContain("MAI write_treatment");
    }
  });

  it("screenplay-page prompt offers write_screenplay too (sessions default here)", () => {
    expect(SCREENPLAY_SYSTEM_PROMPT).toContain('"write_screenplay"');
  });

  it("promptForPage returns the document prompt for the soggetto page", () => {
    expect(promptForPage("soggetto")).toBe(DOCUMENT_SYSTEM_PROMPT);
  });
});
