import { describe, it, expect } from "vitest";
import { needsNoActionNotice } from "./cesare-promise-guard";
import type { IntentResult } from "./cesare-intent-classifier";

const writeIntent = (confidence = 0.9): IntentResult => ({
  type: "translate_document",
  confidence,
});

describe("needsNoActionNotice (#118)", () => {
  it("fires when a confident write intent executed zero tools", () => {
    expect(needsNoActionNotice(writeIntent(), [])).toBe(true);
  });

  it("fires when only READ tools ran (the model read and then promised)", () => {
    expect(
      needsNoActionNotice(writeIntent(), ["read_document", "read_scene"]),
    ).toBe(true);
  });

  it("stays silent when a write tool ran (ASK outcome included — the card is honest)", () => {
    expect(needsNoActionNotice(writeIntent(), ["transform_document"])).toBe(
      false,
    );
    expect(
      needsNoActionNotice(writeIntent(), ["read_document", "rewrite_scene"]),
    ).toBe(false);
  });

  it("stays silent for question/comment intents — no act was expected", () => {
    expect(
      needsNoActionNotice({ type: "question", confidence: 0.95 }, []),
    ).toBe(false);
    expect(needsNoActionNotice({ type: "comment", confidence: 0.9 }, [])).toBe(
      false,
    );
  });

  it("stays silent without a classified intent (no classifier on this turn)", () => {
    expect(needsNoActionNotice(null, [])).toBe(false);
  });

  it("stays silent below the dispatch confidence threshold (ambiguous ask)", () => {
    expect(needsNoActionNotice(writeIntent(0.4), [])).toBe(false);
  });

  it("an unknown executed tool name is not a write — the guard still fires", () => {
    expect(needsNoActionNotice(writeIntent(), ["mystery_tool"])).toBe(true);
  });
});

// Guardian: every tool the classifier can FORCE must be classified as a write
// in the entity map — an unmapped forced tool would make the guard call a
// successful act "no action" (found live: merge_scenes and delete_scene were
// registered tools missing from the map, so the tracer was mute about them and
// the guard would have appended a false notice after a successful merge).
describe("promise-guard ↔ entity-map consistency", () => {
  it("every TOOL_BY_INTENT target is a write in the entity map", async () => {
    const { TOOL_BY_INTENT } = await import("./cesare-intent-classifier");
    const { mappingForTool } = await import("./cesare-tool-entity-map");
    for (const tool of Object.values(TOOL_BY_INTENT)) {
      expect(mappingForTool(tool!)?.access, `tool ${tool}`).toBe("write");
    }
  });
});
