import { describe, it, expect } from "vitest";
import {
  CESARE_DOCUMENT_GEN_TOOLS,
  isDocumentGenToolName,
} from "./cesare-document-tools";
import { TOOL_BY_INTENT } from "./cesare-intent-classifier";
import { mappingForTool, domainForToolInput } from "./cesare-tool-entity-map";

/**
 * #118 — transform_document is the universal whole-document primitive: closed
 * primitives, open instruction. Its value is precisely that NO further per-use
 * case wiring is ever needed — so what must be pinned is the wiring it does
 * need, because each of these registrations fails SILENTLY when missing: the
 * model simply never sees / never routes / mislabels the tool, and the symptom
 * is Cesare interviewing the writer forever instead of acting.
 */
describe("transform_document wiring", () => {
  const def = CESARE_DOCUMENT_GEN_TOOLS.find(
    (t) => t.name === "transform_document",
  );

  it("is defined with the verbatim-instruction contract", () => {
    expect(def).toBeDefined();
    const props = def!.input_schema.properties as unknown as Record<
      string,
      { enum?: string[] }
    >;
    expect(props["document_type"]?.enum).toEqual([
      "soggetto",
      "synopsis",
      "outline",
      "treatment",
      "screenplay",
    ]);
    expect(def!.input_schema.required).toContain("instruction");
  });

  it("is routed by the document-gen dispatcher", () => {
    expect(isDocumentGenToolName("transform_document")).toBe(true);
  });

  it("is the forced tool for the translate_document intent", () => {
    // The classifier understands the request in any language; this mapping is
    // what turns that understanding into an ACT instead of an interview.
    expect(TOOL_BY_INTENT["translate_document"]).toBe("transform_document");
  });

  it("the tracer names the document actually being transformed (#64)", () => {
    // Static fallback exists…
    expect(mappingForTool("transform_document")?.access).toBe("write");
    // …but the input decides the label the writer sees.
    for (const t of [
      "soggetto",
      "synopsis",
      "outline",
      "treatment",
      "screenplay",
    ] as const) {
      expect(
        domainForToolInput("transform_document", { document_type: t }),
      ).toBe(t);
    }
    // Unusable input → null → static fallback, never a crash.
    expect(domainForToolInput("transform_document", null)).toBeNull();
    expect(
      domainForToolInput("transform_document", { document_type: "nope" }),
    ).toBeNull();
    // Fixed-target tools never go through the dynamic path.
    expect(
      domainForToolInput("write_logline", { document_type: "outline" }),
    ).toBeNull();
  });
});
