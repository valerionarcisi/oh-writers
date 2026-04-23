import { describe, it, expect } from "vitest";
import { extractAnimals } from "./extract-animals.js";

describe("extractAnimals", () => {
  it("matches a dog", () => {
    const items = extractAnimals("Un cane abbaia.");
    expect(items.find((i) => i.name === "Cane")).toBeDefined();
  });

  it("counts plural occurrences", () => {
    const items = extractAnimals("I cani corrono. Un cane li segue.");
    const cane = items.find((i) => i.name === "Cane");
    expect(cane?.quantity).toBe(2);
  });

  it("default status is accepted (high confidence)", () => {
    const items = extractAnimals("Un gatto sul tetto.");
    expect(items[0]?.defaultStatus).toBe("accepted");
  });
});
