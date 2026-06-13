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

  // BUG-N68 golden fixture: locks the verified-correct deterministic output for
  // a real Italian opening scene whose CHARACTER cue carries a "(V.O.)"
  // extension AND is separated from its dialogue by a BLANK line (the exact
  // shape of the "Scienze Naturali - Federico II" SC.1 that read as "spaginato"
  // in the UI). The extraction itself was confirmed correct against the live DB
  // (cast=Marco only, location parsed, V.O. as sound, telefono/microfono props);
  // this test prevents a future extractor tweak from silently regressing it.
  describe("BUG-N68 — real IT scene (cue + blank + dialogue, V.O.)", () => {
    const heading = "EXT. MURETTO SOTTO CASA DI MARCO - NOTTE";
    const body = `Marco seduto sul muretto di un edificio residenziale napoletano. Intorno, silenzio della periferia notturna. Telefono davanti a sé, schermo illuminato sul viso. Parla piano al microfono.

      MARCO (V.O.)

      Luca, ascolta. Non interrompermi.
`;

    it("extracts exactly ONE cast member, collapsing the (V.O.) extension", () => {
      const items = extractAll({ heading, body });
      const cast = items.filter((i) => i.category === "cast");
      expect(cast).toHaveLength(1);
      expect(cast[0]?.name).toBe("Marco");
      // The blank line between cue and dialogue must NOT split the cue off.
      expect(cast[0]?.quantity).toBe(1);
    });

    it("parses the INT/EXT + location from the heading", () => {
      const items = extractAll({ heading, body });
      const loc = items.find((i) => i.category === "locations");
      expect(loc?.name).toBe("Muretto Sotto Casa Di Marco");
    });

    it("detects (V.O.) as Voice Over under sound", () => {
      const items = extractAll({ heading, body });
      expect(
        items.find((i) => i.category === "sound" && i.name === "Voice Over"),
      ).toBeDefined();
    });

    it("is deterministic: identical input → identical output across runs", () => {
      const a = extractAll({ heading, body });
      const b = extractAll({ heading, body });
      expect(a).toEqual(b);
    });
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
