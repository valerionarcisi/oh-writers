import { describe, it, expect } from "vitest";
import { formatLocalContext } from "./format-local-context";
import type { LocalContext, SceneSummaryRow } from "@oh-writers/domain";

// [OHW-040c] — formatLocalContext MD output tests

const baseCtx = (): LocalContext => ({
  projectTitle: "Film Test",
  scenes: [],
  currentScene: null,
  sceneWindow: [],
  sceneSummaries: [],
  characters: [],
  activeDocument: null,
  currentRequirement: null,
  activeShootingDay: null,
});

const makeSummary = (n: number, notes: string[] = []): SceneSummaryRow => ({
  sceneId: `scene-${n}`,
  sceneNumber: n,
  sceneHeading: `INT. LOCATION ${n} - GIORNO`,
  settingDescription: `Ambientazione scena ${n}`,
  timeOfDay: "GIORNO",
  presentCharacters: ["Marco"],
  keyActions: ["Azione 1"],
  productionNotes: notes,
  narrativePurpose: `Funzione scena ${n}`,
});

describe("formatLocalContext", () => {
  describe("structure", () => {
    it("returns (no local context) when everything is empty", () => {
      expect(formatLocalContext(baseCtx())).toBe("(no local context)");
    });

    it("contains ## CONTESTO LOCALE header when there is content", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
      };
      expect(formatLocalContext(ctx)).toContain("## CONTESTO LOCALE");
    });
  });

  describe("scene list", () => {
    it("formats scene list as Markdown table", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [
          { id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" },
          { id: "s2", number: 2, heading: "EXT. STRADA - NOTTE" },
        ],
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("| SC | Heading |");
      expect(output).toContain("| 1 | INT. UFFICIO - GIORNO |");
      expect(output).toContain("| 2 | EXT. STRADA - NOTTE |");
    });

    it("respects token cap — never exceeds CAPS.sceneList * 4 chars for scene list section", () => {
      const manyScenes = Array.from({ length: 300 }, (_, i) => ({
        id: `s${i}`,
        number: i + 1,
        heading: `INT. LOCATION MOLTO LUNGA CON NOME LUNGO ${i + 1} - GIORNO`,
      }));
      const ctx: LocalContext = { ...baseCtx(), scenes: manyScenes };
      const output = formatLocalContext(ctx);
      // 1200 tokens * 4 chars/token = 4800 chars max for scene list section
      const sceneListSection =
        output.split("### Lista scene")[1]?.split("###")[0] ?? "";
      expect(sceneListSection.length).toBeLessThanOrEqual(5000);
    });

    it("emits exactly one omit note — no duplicate conflicting counts for large scene lists", () => {
      const manyScenes = Array.from({ length: 300 }, (_, i) => ({
        id: `s${i}`,
        number: i + 1,
        heading: `INT. LOCATION ${i + 1} - GIORNO`,
      }));
      const ctx: LocalContext = { ...baseCtx(), scenes: manyScenes };
      const output = formatLocalContext(ctx);
      // Must contain at most one "…e altre" message in the scene list section
      const sceneListSection =
        output.split("### Lista scene")[1]?.split("###")[0] ?? "";
      const omitMatches = sceneListSection.match(/…e altre/g) ?? [];
      expect(omitMatches.length).toBeLessThanOrEqual(1);
    });
  });

  describe("scene summaries", () => {
    it("includes scene summaries table when summaries are present", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
        sceneSummaries: [makeSummary(1, ["Stunt: caduta"])],
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("### Scene summaries");
      // Spec 81 — the table exposes what happens + narrative function so the
      // model understands the scene before editing it.
      expect(output).toContain(
        "| SC | Heading | Personaggi | Cosa succede | Funzione narrativa |",
      );
    });

    it("omits scene summaries section when sceneSummaries is empty", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
        sceneSummaries: [],
      };
      const output = formatLocalContext(ctx);
      expect(output).not.toContain("### Scene summaries");
    });

    it("renders keyActions and narrativePurpose (spec 81)", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
        sceneSummaries: [makeSummary(1, [])],
      };
      const output = formatLocalContext(ctx);
      // keyActions ("Azione 1") + narrativePurpose ("Funzione scena 1") reach
      // the model — the beat-level content that prevents truncation.
      expect(output).toContain("Azione 1");
      expect(output).toContain("Funzione scena 1");
    });

    it("shows the row for a summary with empty production notes", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
        sceneSummaries: [makeSummary(1, [])],
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("| 1 |");
    });
  });

  describe("active scene (priority 1)", () => {
    it("shows active scene heading", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        currentScene: { id: "s5", number: 5, heading: "EXT. CASCINA - ALBA" },
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("SC 5 — EXT. CASCINA - ALBA");
    });

    it("active scene present even with many other scenes over cap", () => {
      const manyScenes = Array.from({ length: 300 }, (_, i) => ({
        id: `s${i}`,
        number: i + 1,
        heading: `INT. LOC ${i + 1} - GIORNO`,
      }));
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: manyScenes,
        currentScene: { id: "s5", number: 5, heading: "EXT. CASCINA - NOTTE" },
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("EXT. CASCINA - NOTTE");
    });
  });

  describe("active document", () => {
    it("shows active document type and content", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        activeDocument: {
          id: "doc-1",
          type: "synopsis",
          content: "Una storia di vendetta ambientata in Sicilia.",
          isActive: true,
        },
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("### Documento attivo [SYNOPSIS]");
      expect(output).toContain("Una storia di vendetta");
    });

    it("truncates document content at cap", () => {
      const longContent = "A".repeat(10000);
      const ctx: LocalContext = {
        ...baseCtx(),
        activeDocument: {
          id: "doc-1",
          type: "treatment",
          content: longContent,
          isActive: true,
        },
      };
      const output = formatLocalContext(ctx);
      // 2000 tokens * 4 chars = 8000 chars max
      const docSection = output.split("### Documento attivo")[1] ?? "";
      expect(docSection.length).toBeLessThanOrEqual(8100);
      expect(output).toContain("…(troncato)");
    });
  });

  describe("page label detection", () => {
    it("labels as Locations when currentRequirement is present", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        scenes: [{ id: "s1", number: 1, heading: "INT. LOC - GIORNO" }],
        currentRequirement: { name: "Cascina", id: "req-1" },
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain("## CONTESTO LOCALE — Locations");
    });
  });

  // Cesare cache fix — these hints used to be baked into the schedule/
  // shooting-plan skills' cache_control-marked guidanceBlock, keyed on
  // activeDayNumber/activeSceneId. Both change whenever the user switches
  // day/scene within the SAME session, which broke the cache prefix every
  // time. They moved here, to the uncached per-turn tail — this is the
  // regression guard for that move.
  describe("active-state hints (schedule/shooting-plan tool defaults)", () => {
    it("includes the active shooting day hint when activeShootingDay is set", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        currentScene: { id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" },
        activeShootingDay: {
          dayNumber: 3,
        } as LocalContext["activeShootingDay"],
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain(
        "Giornata attiva (selezionata dall'utente): Giornata 3. Quando l'utente dice \"questa giornata\" si riferisce a questa.",
      );
    });

    it("omits the active shooting day hint when activeShootingDay is null", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        currentScene: { id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" },
      };
      const output = formatLocalContext(ctx);
      expect(output).not.toContain("Giornata attiva");
    });

    it("includes the active scene hint (for shooting-plan tool defaults) when currentScene is set", () => {
      const ctx: LocalContext = {
        ...baseCtx(),
        currentScene: {
          id: "scene-42",
          number: 1,
          heading: "INT. UFFICIO - GIORNO",
        },
      };
      const output = formatLocalContext(ctx);
      expect(output).toContain(
        "Scena attiva (selezionata dall'utente): scene-42. Usala come default per scene_id nei tool quando l'utente non specifica una scena diversa.",
      );
    });

    it("omits the active scene hint when currentScene is null", () => {
      const output = formatLocalContext(baseCtx());
      expect(output).not.toContain("Scena attiva (selezionata");
    });
  });
});
