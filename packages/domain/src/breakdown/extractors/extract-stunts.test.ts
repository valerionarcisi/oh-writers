import { describe, it, expect } from "vitest";
import { extractStunts } from "./extract-stunts.js";

describe("extractStunts", () => {
  it("matches a fight", () => {
    const items = extractStunts("Inizia un combattimento brutale.");
    expect(items.find((i) => i.name === "Combattimento")).toBeDefined();
  });

  it("matches a fall + jump", () => {
    const items = extractStunts("Una caduta dal balcone, poi un salto.");
    const names = items.map((i) => i.name).sort();
    expect(names).toContain("Caduta");
    expect(names).toContain("Salto");
  });
});
