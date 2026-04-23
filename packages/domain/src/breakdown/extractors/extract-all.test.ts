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
});
