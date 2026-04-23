import { describe, it, expect } from "vitest";
import { extractExtras } from "./extract-extras.js";

describe("extractExtras", () => {
  it("matches 'una folla'", () => {
    const items = extractExtras("Una folla applaude.");
    expect(items.find((i) => i.name === "Folla")).toBeDefined();
  });

  it("matches 'pubblico'", () => {
    const items = extractExtras("Il pubblico ride.");
    expect(items.find((i) => i.name === "Pubblico")).toBeDefined();
  });

  it("does not match unrelated words", () => {
    expect(extractExtras("Una sola scarpa.")).toEqual([]);
  });
});
