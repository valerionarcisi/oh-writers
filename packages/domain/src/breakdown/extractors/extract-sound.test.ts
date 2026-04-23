import { describe, it, expect } from "vitest";
import { extractSound } from "./extract-sound.js";

describe("extractSound", () => {
  it("matches V.O. extension", () => {
    const items = extractSound("TEA (V.O.) Filì venni!");
    expect(items.find((i) => i.name === "Voice Over")).toBeDefined();
  });

  it("matches multiple sound cues", () => {
    const items = extractSound("(applauso) e (risate) dal pubblico.");
    const names = items.map((i) => i.name).sort();
    expect(names).toContain("Applauso");
    expect(names).toContain("Risate");
  });

  it("default status is pending", () => {
    const items = extractSound("Si sente un campanello.");
    expect(items[0]?.defaultStatus).toBe("pending");
  });
});
