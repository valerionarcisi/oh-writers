import { describe, it, expect } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import {
  findSection,
  parseHeading,
  extractSideChannelMarkers,
  markerAwareFallbackText,
  toolErrorPayload,
  createDocumentTools,
} from "./cesare-tools";
import { parsePlanDescription } from "./cesare-shooting-plan-tools";
import { CesareError } from "./cesare.errors";
import { CesareSessionNotFoundError } from "./sessions/sessions.errors";
import { DbError } from "@oh-writers/utils";

// F-A3 — the server emits a success marker ONLY when a write tool genuinely
// mutated the DB, so the client card can never fabricate success. For the
// non-document write tools (budget/location/schedule/shooting) the honest
// signal is a generic `entity-applied` marker carrying the entity the TOOL
// touched (not the page), which fixes F-M1 at the source.
describe("extractSideChannelMarkers — honest success for write tools", () => {
  const markersFor = (toolName: string, content: string): string[] => {
    const acc: string[] = [];
    extractSideChannelMarkers(toolName, content, acc, "test-project-id");
    return acc;
  };

  it("emits an entity-applied marker when a budget write succeeds", () => {
    const markers = markersFor(
      "add_budget_line",
      JSON.stringify({ id: "line-1", name: "Grip", topSheet: "below-line" }),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toContain("ohw:entity-applied");
    expect(markers[0]).toContain('"domain":"budget"');
  });

  it("does NOT emit a marker when a write tool FAILS (error result)", () => {
    const markers = markersFor(
      "add_budget_line",
      JSON.stringify({ error: "Budget is locked" }),
    );
    expect(markers).toEqual([]);
  });

  it("does NOT emit a marker for a READ tool", () => {
    const markers = markersFor(
      "read_budget_lines",
      JSON.stringify({ lines: [] }),
    );
    expect(markers).toEqual([]);
  });

  it("does NOT emit a marker when the result is not a JSON object", () => {
    expect(markersFor("move_scene_to_day", "not-json")).toEqual([]);
    expect(markersFor("move_scene_to_day", "null")).toEqual([]);
  });

  it("carries the entity the TOOL touched, not the page (F-M1)", () => {
    const markers = markersFor(
      "create_location_requirement",
      JSON.stringify({ requirement_id: "r-1", created: true }),
    );
    expect(markers[0]).toContain('"domain":"locations"');
  });

  it("does NOT emit an applied marker for a proposal tool", () => {
    // propose_* tools only surface a suggestion to accept — they apply nothing,
    // so claiming an edit would be the F-A3 bug.
    const markers = markersFor(
      "propose_missing_lines",
      JSON.stringify({ proposals: [{ id: "g-1" }] }),
    );
    expect(markers).toEqual([]);
  });

  it("emits a doc-applied marker for the treatment generator (F-A2)", () => {
    // propose_treatment_from_narrative applies LIVE + auto-versions, so it must
    // emit the `ohw:doc-applied` marker the honest card reads — exactly like the
    // other document generators.
    const markers = markersFor(
      "propose_treatment_from_narrative",
      JSON.stringify({
        ok: true,
        applied_live: true,
        document_type: "treatment",
        version_id: "v-1",
        previous_version_id: null,
      }),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toContain("ohw:doc-applied");
    expect(markers[0]).toContain('"document_type":"treatment"');
    expect(markers[0]).toContain('"version_id":"v-1"');
  });

  it("does NOT emit a doc-applied marker when the treatment generator fails", () => {
    const markers = markersFor(
      "propose_treatment_from_narrative",
      JSON.stringify({ error: "Non c'è ancora materiale da cui scrivere" }),
    );
    expect(markers).toEqual([]);
  });

  it("emits a screenplay-proposal marker for rename / revision / merge (N3)", () => {
    for (const tool of [
      "propose_rename_entity",
      "propose_screenplay_revision",
      "merge_scenes",
    ]) {
      expect(markersFor(tool, JSON.stringify({ ok: true }))).toEqual([
        "<!--ohw:screenplay-proposal-->",
      ]);
    }
  });

  it("does NOT emit a screenplay-proposal marker when the tool FAILS (N3)", () => {
    const markers = markersFor(
      "propose_rename_entity",
      JSON.stringify({ error: "'from' not found in screenplay" }),
    );
    expect(markers).toEqual([]);
  });

  it("emits a doc-applied marker for the screenplay generator (BUG-N67)", () => {
    // generate_screenplay_from_narrative applies the first draft LIVE as the
    // active screenplay version, so it MUST emit the doc-applied marker the
    // honest card + "Vai alla Sceneggiatura" navigation read.
    const markers = markersFor(
      "generate_screenplay_from_narrative",
      JSON.stringify({
        ok: true,
        applied_live: true,
        document_type: "screenplay",
        version_id: "spv-1",
        previous_version_id: null,
      }),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toContain("ohw:doc-applied");
    expect(markers[0]).toContain('"document_type":"screenplay"');
    expect(markers[0]).toContain('"version_id":"spv-1"');
  });
});

describe("parseHeading", () => {
  it("parses a standard INT slugline", () => {
    expect(parseHeading("INT. CUCINA - GIORNO")).toEqual({
      name: "CUCINA",
      intExt: "INT",
      timeOfDay: ["GIORNO"],
    });
  });

  it("parses EXT with multi-segment time-of-day", () => {
    expect(parseHeading("EXT. STRADA - SESTO SAN GIOVANNI - NOTTE")).toEqual({
      name: "STRADA",
      intExt: "EXT",
      timeOfDay: ["SESTO SAN GIOVANNI", "NOTTE"],
    });
  });

  it("recognises INT./EXT. compound prefix", () => {
    const r = parseHeading("INT./EXT. RADICE - NOTTE");
    expect(r.intExt).toBe("INT/EXT");
    expect(r.name).toBe("RADICE");
  });

  it("folds EST. into EXT (schema doesn't model EST separately)", () => {
    expect(parseHeading("EST. PIAZZA - ALBA").intExt).toBe("EXT");
  });

  it("recognises I/E shorthand as INT", () => {
    expect(parseHeading("I/E AUTO - GIORNO").intExt).toBe("INT");
  });

  it("returns null intExt when no prefix is present", () => {
    expect(parseHeading("UNA STRADA QUALSIASI").intExt).toBeNull();
  });

  it("handles a heading with no time-of-day", () => {
    expect(parseHeading("INT. STUDIO")).toEqual({
      name: "STUDIO",
      intExt: "INT",
      timeOfDay: [],
    });
  });

  it("trims surrounding whitespace", () => {
    const r = parseHeading("   EXT. BAR - GIORNO   ");
    expect(r.name).toBe("BAR");
    expect(r.intExt).toBe("EXT");
  });
});

describe("findSection", () => {
  it("finds a markdown section and bounds the body at the next heading", () => {
    const doc = [
      "# Atto I",
      "",
      "Prima parte.",
      "",
      "## Atto II",
      "",
      "Seconda parte,",
      "ancora seconda parte.",
      "",
      "# Atto III",
      "",
      "Terza parte.",
    ].join("\n");

    const range = findSection(doc, "Atto II");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.headingText).toBe("## Atto II");
    expect(range.bodyStart).toBe(5);
    expect(range.bodyEnd).toBe(9);
  });

  it("returns null when the heading is missing", () => {
    const doc = "# Atto I\n\nQualcosa.";
    expect(findSection(doc, "Non esiste")).toBeNull();
  });

  it("is case-insensitive and tolerant of markdown markers", () => {
    const doc = "### conclusione\n\nFine.";
    const range = findSection(doc, "Conclusione");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.headingText).toBe("### conclusione");
  });

  it("treats the document end as the body terminator when no further heading exists", () => {
    const doc = "# Solo\n\nLinea uno.\nLinea due.\n";
    const range = findSection(doc, "Solo");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.bodyEnd).toBe(5);
  });
});

describe("parsePlanDescription", () => {
  it("recognizes a mixed Italian/English shot list", () => {
    const shots = parsePlanDescription(
      "classico: WS forno, due CU di Giulio, OTS Tea, insert delle foto",
    );
    expect(shots.map((s) => s.shotSize)).toEqual([
      "WS",
      "CU",
      "CU",
      "OTS",
      "INSERT",
    ]);
  });

  it("expands Italian repetition keywords (tre CU)", () => {
    const shots = parsePlanDescription("tre CU di Giulio");
    expect(shots).toHaveLength(3);
    expect(shots.every((s) => s.shotSize === "CU")).toBe(true);
  });

  it("falls back to a single WS when no keyword is recognized", () => {
    const shots = parsePlanDescription(
      "qualcosa di completamente non descritto",
    );
    expect(shots).toHaveLength(1);
    expect(shots[0]?.shotSize).toBe("WS");
  });

  it("disambiguates primissimo piano (ECU) from primo piano (CU)", () => {
    const shots = parsePlanDescription("primissimo piano di Giulio");
    expect(shots).toHaveLength(1);
    expect(shots[0]?.shotSize).toBe("ECU");
  });

  it("treats numeric prefixes as repeat counts", () => {
    const shots = parsePlanDescription("4 inserts delle foto");
    expect(shots).toHaveLength(4);
    expect(shots.every((s) => s.shotSize === "INSERT")).toBe(true);
  });

  it("preserves order across separators ('e', 'poi', commas)", () => {
    const shots = parsePlanDescription("WS, poi CU e infine OTS");
    expect(shots.map((s) => s.shotSize)).toEqual(["WS", "CU", "OTS"]);
  });
});

// Marker-only turns get a fallback bubble matched to the affordance the
// marker actually renders — the ✓/✕ overlay copy is reserved for screenplay
// inline proposals ("non vedo la x", 2026-07-02).
describe("markerAwareFallbackText — fallback matches the rendered affordance", () => {
  it("ask-new-version → points at the Sovrascrivi/Nuova versione card, no ✓/✕", () => {
    const text = markerAwareFallbackText('<!--ohw:ask-new-version {"x":1}-->');
    expect(text).toContain("sovrascrivi");
    expect(text).not.toContain("✓");
  });

  it("doc-applied → says the edit is already live + revert via Versioni", () => {
    const text = markerAwareFallbackText('<!--ohw:doc-applied {"x":1}-->');
    expect(text).toContain("già applicata");
    expect(text).toContain("Versioni");
    expect(text).not.toContain("✓");
  });

  it("entity-applied → same applied copy", () => {
    expect(
      markerAwareFallbackText('<!--ohw:entity-applied {"domain":"budget"}-->'),
    ).toContain("già applicata");
  });

  it("screenplay proposal markers keep the ✓/✕ copy", () => {
    expect(
      markerAwareFallbackText('<!--ohw:screenplay-proposal {"x":1}-->'),
    ).toContain("✓");
  });

  it("ask wins over an applied marker in the same turn (the card is the pending action)", () => {
    const text = markerAwareFallbackText(
      '<!--ohw:doc-applied {"x":1}-->\n<!--ohw:ask-new-version {"y":2}-->',
    );
    expect(text).toContain("sovrascrivi");
  });

  it("no marker → honest 'nothing applied' copy", () => {
    expect(markerAwareFallbackText("")).toContain("non è stata applicata");
  });
});

// #44 — a failed tool used to hand the model `{ error: "<vague message>" }`
// with no tag and no is_error flag. With nothing factual to report, the model
// invented a confident root cause: it told the user to file a bug about a
// constraint on `document_versions.number` when the real failure was a missing
// Cesare session. The payload now carries the tag as the one fact, and says
// outright not to elaborate.
describe("toolErrorPayload", () => {
  it("carries the error tag so the model has a fact to report", () => {
    const payload = toolErrorPayload(
      new CesareSessionNotFoundError("sess-1") as never,
    );
    expect(payload.code).toBe("CesareSessionNotFoundError");
    expect(payload.error).toContain("Cesare session");
  });

  it("tells the model not to invent a cause", () => {
    const payload = toolErrorPayload(new CesareError("boom") as never);
    expect(payload.guidance).toMatch(/do not invent/i);
    expect(payload.guidance).toMatch(/database/i);
  });

  it("never leaks the raw SQL cause a DbError carries", () => {
    const dbError = new DbError(
      "insertVersion",
      new Error('insert into "document_versions" violates unique constraint'),
    );
    const payload = toolErrorPayload(dbError as never);
    expect(payload.code).toBe("DbError");
    // dbCause stays in the server log; the model gets the operation, not SQL.
    expect(JSON.stringify(payload)).not.toContain("document_versions");
    expect(JSON.stringify(payload)).not.toContain("unique constraint");
  });

  it("degrades to UnknownError rather than throwing on an untagged error", () => {
    const payload = toolErrorPayload({ message: "odd" } as never);
    expect(payload.code).toBe("UnknownError");
  });
});

// #108 — the scaletta is stored as structured JSON, not prose. A find/replace
// that happened to span a `","` boundary produced a string that no longer
// parsed, and an unparseable outline reads as an EMPTY one — so a mistargeted
// rename silently blanked the whole scaletta. Both text tools now refuse the
// call outright rather than trusting the model to have read the guidance.
describe("[#108] the text edit tools refuse to touch a structured scaletta", () => {
  const db = {} as never;
  const outlineDoc = {
    documentId: "doc-1",
    documentType: DocumentTypes.OUTLINE,
    content: JSON.stringify({
      acts: [
        {
          id: "a1",
          title: "Atto I",
          sequences: [
            {
              id: "s1",
              title: "Sequenza 1",
              scenes: [
                {
                  id: "sc1",
                  heading: "INT. CUCINA - GIORNO",
                  description: "Elena prepara il caffè.",
                  characters: ["Elena"],
                  pageEstimate: 1,
                  notes: "",
                },
              ],
            },
          ],
        },
      ],
    }),
  };

  it("apply_text_edit refuses and points at edit_outline_scene", async () => {
    const before = outlineDoc.content;
    const tools = createDocumentTools(db, { ...outlineDoc });
    const result = await tools.apply_text_edit.execute!(
      { find: "Elena", replace: "Chiara" },
      {} as never,
    );

    expect(result).toMatchObject({ ok: false });
    expect(String((result as { reason: string }).reason)).toContain(
      "edit_outline_scene",
    );
    // Nothing was rewritten, so the document cannot have been corrupted.
    expect(outlineDoc.content).toBe(before);
  });

  it("compress_section refuses too (no prose sections to slice)", async () => {
    const tools = createDocumentTools(db, { ...outlineDoc });
    const result = await tools.compress_section.execute!(
      { heading: "Atto I", target_words: 50 },
      {} as never,
    );

    expect(result).toMatchObject({ ok: false });
    expect(String((result as { reason: string }).reason)).toContain(
      "edit_outline_scene",
    );
  });

  it("still works on a prose document (the guard is scaletta-only)", async () => {
    const tools = createDocumentTools(db, {
      documentId: "doc-2",
      documentType: DocumentTypes.SOGGETTO,
      content: "<p>Elena prepara il caffè.</p>",
    });
    const result = await tools.apply_text_edit.execute!(
      { find: "non presente nel testo", replace: "x" },
      {} as never,
    );

    // Refused for NOT FINDING the string — i.e. it got past the doc-type guard
    // and actually attempted the match.
    expect(result).toMatchObject({ ok: false });
    expect(String((result as { reason: string }).reason)).toContain(
      "not found",
    );
  });
});
