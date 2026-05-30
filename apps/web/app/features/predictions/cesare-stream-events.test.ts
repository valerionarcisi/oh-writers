import { describe, it, expect } from "vitest";
import {
  CesareStreamEventSchema,
  encodeStreamEvent,
  parseStreamEventLine,
  parseToolsExecutedMarker,
  type CesareStreamEvent,
} from "./cesare-stream-events";
import {
  mappingForTool,
  entityRefForDomain,
  labelForDomain,
} from "./cesare-tool-entity-map";

describe("CesareStreamEventSchema", () => {
  it("accepts a valid reading event (happy path)", () => {
    const event = {
      _tag: "reading",
      entity: { domain: "screenplay", label: "Sceneggiatura" },
    };
    expect(CesareStreamEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts a writing event for a cross-domain target", () => {
    const event = {
      _tag: "writing",
      entity: { domain: "soggetto", label: "Soggetto" },
    };
    const parsed = CesareStreamEventSchema.safeParse(event);
    expect(parsed.success).toBe(true);
  });

  it("accepts a done event with the final result + tool count", () => {
    const event = {
      _tag: "done",
      result: "Fatto.<!--ohw:tools=2-->",
      toolsExecuted: 2,
    };
    expect(CesareStreamEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects an unknown tag (edge)", () => {
    expect(
      CesareStreamEventSchema.safeParse({ _tag: "thinking" }).success,
    ).toBe(false);
  });

  it("rejects a reading event with an unknown domain (boundary)", () => {
    const event = {
      _tag: "reading",
      entity: { domain: "moodboard", label: "X" },
    };
    expect(CesareStreamEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects a done event with a negative tool count (error)", () => {
    const event = { _tag: "done", result: "x", toolsExecuted: -1 };
    expect(CesareStreamEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("encodeStreamEvent / parseStreamEventLine", () => {
  it("round-trips an event through NDJSON", () => {
    const event: CesareStreamEvent = { _tag: "reasoning", text: "Analizzo" };
    const line = encodeStreamEvent(event);
    expect(line.endsWith("\n")).toBe(true);
    expect(parseStreamEventLine(line)).toEqual(event);
  });

  it("returns null for a blank line", () => {
    expect(parseStreamEventLine("   ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseStreamEventLine("{not json")).toBeNull();
  });

  it("returns null for a structurally invalid event", () => {
    expect(
      parseStreamEventLine(JSON.stringify({ _tag: "writing" })),
    ).toBeNull();
  });
});

describe("parseToolsExecutedMarker", () => {
  it("reads the tools marker", () => {
    expect(parseToolsExecutedMarker("ok<!--ohw:tools=3-->")).toBe(3);
  });
  it("returns 0 when the marker is absent", () => {
    expect(parseToolsExecutedMarker("no marker here")).toBe(0);
  });
});

describe("tool → entity map", () => {
  it("classifies a read tool as reading on its target domain", () => {
    const m = mappingForTool("read_scene");
    expect(m).toEqual({ access: "read", domain: "screenplay" });
  });

  it("maps a cross-domain write to its TARGET, not the page", () => {
    // Issued on the Sceneggiatura page, this tool writes the Sinossi.
    const m = mappingForTool("propose_synopsis_from_screenplay");
    expect(m).toEqual({ access: "write", domain: "synopsis" });
  });

  it("maps the logline generator onto the logline domain", () => {
    expect(mappingForTool("propose_logline_from_screenplay")).toEqual({
      access: "write",
      domain: "logline",
    });
  });

  it("maps the free-prompt write_logline tool onto the logline domain", () => {
    expect(mappingForTool("write_logline")).toEqual({
      access: "write",
      domain: "logline",
    });
  });

  it("returns null for an unknown tool (fallback to raw tool event)", () => {
    expect(mappingForTool("totally_unknown_tool")).toBeNull();
  });

  it("produces an IT entity ref label for a domain", () => {
    expect(entityRefForDomain("budget")).toEqual({
      domain: "budget",
      label: "Budget",
    });
    expect(labelForDomain("locations")).toBe("Location");
    expect(labelForDomain("logline")).toBe("Logline");
  });
});
