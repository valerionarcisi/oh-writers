import { describe, it, expect } from "vitest";
import { extractProps } from "./extract-props.js";

describe("extractProps", () => {
  it("matches singular and plural via stem", () => {
    const items = extractProps(
      "John ha il microfono in mano. Tutti i microfoni sono accesi.",
    );
    const mic = items.find((i) => i.name === "Microfono");
    expect(mic?.quantity).toBe(2);
  });

  it("matches multiple distinct props in one scene", () => {
    const items = extractProps(
      "Porta un vassoio con bicchieri. La bottiglia cade. Accende una sigaretta con l'accendino.",
    );
    const names = items.map((i) => i.name).sort();
    expect(names).toEqual([
      "Accendino",
      "Bicchiere",
      "Bottiglia",
      "Sigaretta",
      "Vassoio",
    ]);
  });

  it("matches multi-word lemma 'fascina di legna'", () => {
    const items = extractProps("Trasporta una fascina di legna sul carro.");
    expect(items.find((i) => i.name === "Fascina Di Legna")).toBeDefined();
  });

  it("does not false-match 'palata' as 'pala'", () => {
    expect(extractProps("una palata di sabbia")).toEqual([]);
  });

  it("matches both 'cellulare' and 'telefono' independently", () => {
    const items = extractProps(
      "Squilla il cellulare. Lei risponde al telefono fisso.",
    );
    const names = items.map((i) => i.name).sort();
    expect(names).toContain("Cellulare");
    expect(names).toContain("Telefono");
  });

  it("default status is pending (ghost suggestion)", () => {
    const items = extractProps("un libro sulla scrivania");
    expect(items[0]?.defaultStatus).toBe("pending");
  });

  it("category is 'props'", () => {
    const items = extractProps("una pistola sul tavolo");
    expect(items[0]?.category).toBe("props");
  });

  it("returns empty for empty body", () => {
    expect(extractProps("")).toEqual([]);
  });

  it("does not match props inside other words", () => {
    expect(extractProps("una conversazione interessante")).toEqual([]);
  });
});
