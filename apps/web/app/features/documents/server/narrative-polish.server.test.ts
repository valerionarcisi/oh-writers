import { describe, it, expect } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import {
  GROUNDING_RULES,
  SYSTEM_PROMPTS,
  TOOL_NAME,
  NARRATIVE_POLISH_TOOL,
  buildNarrativeSystemPrompt,
  type NarrativePolishSuggestionDoc,
} from "./narrative-polish.server";

const NARRATIVE_DOC_TYPES: readonly NarrativePolishSuggestionDoc[] = [
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
];

// These structural tests verify the N-27 grounding fix at the prompt-build
// layer only. Grounding QUALITY (does the real model actually stop inventing
// elements?) is validated separately against the real Anthropic API at the
// Lead gate — mock returns static fixtures and cannot exercise the prompt.

describe("GROUNDING_RULES", () => {
  it("anchors notes to the text actually present", () => {
    expect(GROUNDING_RULES).toMatch(/SOLO sul testo/i);
    expect(GROUNDING_RULES).toMatch(/non inventare/i);
  });

  it("forbids asserting non-present elements as real and requires the proposal frame", () => {
    expect(GROUNDING_RULES).toContain("potresti introdurre");
    expect(GROUNDING_RULES).toMatch(/mai come se fosse già presente/i);
  });

  it("blocks imposing an act structure the prose does not declare", () => {
    expect(GROUNDING_RULES).toMatch(/Atto I\/II\/III/);
    expect(GROUNDING_RULES).toMatch(/non dichiara/i);
  });

  it("encourages anchoring each note to a short quote", () => {
    expect(GROUNDING_RULES).toMatch(/àncora/i);
    expect(GROUNDING_RULES).toMatch(/virgolette/i);
  });

  it("classifies but never hides a real note, and names the strongest as primary (#99)", () => {
    // Regression guard for #99: the old escape hatch let the model omit notes
    // ("declassala a 'optional' oppure non mostrarla") which collapsed the panel
    // into a permanent "OK editoriale". The rules must now forbid hiding and
    // require at least the strongest weaknesses to surface as high/medium.
    expect(GROUNDING_RULES).not.toMatch(/non mostrarla/i);
    expect(GROUNDING_RULES).toMatch(/non nascondere mai un rilievo reale/i);
    expect(GROUNDING_RULES).toMatch(/severità "high" o "medium"/i);
  });
});

describe("buildNarrativeSystemPrompt", () => {
  it("injects the grounding rules for every narrative segment", () => {
    for (const docType of NARRATIVE_DOC_TYPES) {
      const prompt = buildNarrativeSystemPrompt(docType);
      expect(prompt).toContain(GROUNDING_RULES);
    }
  });

  it("places the grounding rules before the doc-specific body", () => {
    for (const docType of NARRATIVE_DOC_TYPES) {
      const prompt = buildNarrativeSystemPrompt(docType);
      expect(prompt.indexOf(GROUNDING_RULES)).toBe(0);
    }
  });

  it("keeps each prompt rooted in the Cesare dramaturg persona", () => {
    for (const docType of NARRATIVE_DOC_TYPES) {
      expect(buildNarrativeSystemPrompt(docType)).toContain("Sei Cesare");
    }
  });
});

describe("SYSTEM_PROMPTS", () => {
  it("carries the grounding rules for every doc type", () => {
    for (const docType of NARRATIVE_DOC_TYPES) {
      expect(SYSTEM_PROMPTS[docType]).toContain(GROUNDING_RULES);
    }
  });

  it("matches the prompt builder output (no drift)", () => {
    for (const docType of NARRATIVE_DOC_TYPES) {
      expect(SYSTEM_PROMPTS[docType]).toBe(buildNarrativeSystemPrompt(docType));
    }
  });

  it("no longer instructs the model to focus on a three-act frame", () => {
    // The only mention of three acts left in the prompt is the grounding rule
    // that FORBIDS imposing it; the doc-specific focus list must not steer
    // toward it. We assert against the body that follows the grounding block.
    const soggettoBody = SYSTEM_PROMPTS[DocumentTypes.SOGGETTO].replace(
      GROUNDING_RULES,
      "",
    );
    expect(soggettoBody).not.toContain("struttura in tre atti");
    const outlineBody = SYSTEM_PROMPTS[DocumentTypes.OUTLINE].replace(
      GROUNDING_RULES,
      "",
    );
    expect(outlineBody).not.toContain("bilanciamento degli atti");
  });
});

describe("NARRATIVE_POLISH_TOOL (transport unchanged — tracer invariant)", () => {
  it("keeps the canonical tool name", () => {
    expect(TOOL_NAME).toBe("submit_narrative_suggestions");
    expect(NARRATIVE_POLISH_TOOL.name).toBe(TOOL_NAME);
  });

  it("preserves the suggestions array schema with shared editorial fields", () => {
    const suggestions =
      NARRATIVE_POLISH_TOOL.input_schema.properties.suggestions;
    expect(suggestions.type).toBe("array");
    expect(suggestions.minItems).toBe(1);
    expect(suggestions.maxItems).toBe(6);
    expect(Object.keys(suggestions.items.properties).sort()).toEqual([
      "area",
      "body",
      "id",
      "minimalIntervention",
      "severity",
      "status",
      "title",
      "type",
      "whenToIgnore",
      "whyItMatters",
    ]);
    expect([...suggestions.items.required].sort()).toEqual([
      "area",
      "body",
      "id",
      "severity",
      "title",
      "type",
    ]);
  });

  it("supports explicit editorial classifications", () => {
    const typeField =
      NARRATIVE_POLISH_TOOL.input_schema.properties.suggestions.items.properties
        .type;
    expect(typeField.enum).toContain("approved");
    expect(typeField.enum).toContain("authorial_choice");
  });

  it("uses the richer body field instead of the old message field", () => {
    const body =
      NARRATIVE_POLISH_TOOL.input_schema.properties.suggestions.items.properties
        .body;
    expect(body.maxLength).toBe(360);
  });

  it("keeps the severity scale visible in the tool schema", () => {
    const severity =
      NARRATIVE_POLISH_TOOL.input_schema.properties.suggestions.items.properties
        .severity;
    expect(severity.enum).toEqual(["high", "medium", "low", "optional"]);
  });
});
