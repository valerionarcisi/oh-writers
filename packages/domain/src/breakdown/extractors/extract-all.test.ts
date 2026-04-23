import { describe, it, expect } from "vitest";
import { extractAll } from "./extract-all.js";

describe("extractAll — orchestrator", () => {
  it("runs every extractor and merges items", () => {
    const heading = "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE";
    const body = `JOHN (35) ha il microfono in mano. È in piedi in un angolo del ristorante.

JOHN
AHAHHAH! Buona serata a tutti!

PUBBLICO
Ma che sarria?

JOHN
(risate)

Vediamo il ristorante fuori, le macchine che passano sulla strada.

(applauso)

TEA (V.O.)
Filì venni!
`;
    const items = extractAll({ heading, body });

    const byCategory = items.reduce<Record<string, string[]>>((acc, it) => {
      (acc[it.category] = acc[it.category] ?? []).push(it.name);
      return acc;
    }, {});

    expect(byCategory["cast"]?.sort()).toEqual(["John", "Pubblico", "Tea"]);
    expect(byCategory["locations"]).toContain("Angolo Open Grezzo");
    expect(byCategory["locations"]).toContain("Fuori Dalla Porta");
    expect(byCategory["vehicles"]).toContain("Macchina");
    expect(byCategory["sound"]).toContain("Applauso");
    expect(byCategory["sound"]).toContain("Risate");
    expect(byCategory["sound"]).toContain("Voice Over");
    expect(byCategory["extras"]).toContain("Pubblico");
  });

  it("returns empty array when both heading and body are empty", () => {
    expect(extractAll({ heading: "", body: "" })).toEqual([]);
  });

  describe("English screenplay coverage", () => {
    // Documents what the IT-tuned extractors actually do on English text.
    // Cast (CAPS cues) and Locations (INT./EXT. sluglines) are
    // language-agnostic. The Italian lemma extractors (props, vehicles,
    // animals, atmosphere, makeup, stunts, extras, sound-IT-words) return
    // nothing on English bodies — by design (Spec 10e, EN extractors v2).
    // The only sound match that survives is "V.O." / "(V.O.)" since the stem
    // is the literal Fountain marker.
    const heading = "INT. OLD HOUSE - KITCHEN - MOMENTS LATER";
    const body = `A yellowed note is taped to the refrigerator. Elena pulls it off.

ELENA (V.O.)
If you are reading this, I am gone.

She folds the note and puts it in her pocket.
`;

    it("detects English CHARACTER cues", () => {
      const items = extractAll({ heading, body });
      expect(
        items.find((i) => i.category === "cast" && i.name === "Elena"),
      ).toBeDefined();
    });

    it("parses English INT./EXT. sluglines", () => {
      const items = extractAll({ heading, body });
      const loc = items.find((i) => i.category === "locations");
      expect(loc?.name).toContain("Old House");
    });

    it("detects (V.O.) marker as Sound regardless of language", () => {
      const items = extractAll({ heading, body });
      expect(
        items.find((i) => i.category === "sound" && i.name === "Voice Over"),
      ).toBeDefined();
    });

    it("does NOT extract IT-only props from English text (no false positives)", () => {
      const items = extractAll({ heading, body });
      expect(items.filter((i) => i.category === "props")).toEqual([]);
    });

    it("does not misclassify FADE OUT./THE END. as cast", () => {
      const items = extractAll({
        heading: "EXT. OLD HOUSE - DAWN",
        body: "Lights on in every window.\n\nFADE OUT.\n\nTHE END.\n",
      });
      expect(items.filter((i) => i.category === "cast")).toEqual([]);
    });
  });
});
