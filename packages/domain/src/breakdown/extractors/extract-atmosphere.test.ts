import { describe, it, expect } from "vitest";
import { extractAtmosphere } from "./extract-atmosphere.js";

describe("extractAtmosphere", () => {
  it("matches rain", () => {
    const items = extractAtmosphere("Una forte pioggia cade.");
    expect(items.find((i) => i.name === "Pioggia")).toBeDefined();
  });

  it("matches multiple weather elements", () => {
    const items = extractAtmosphere("C'è nebbia ovunque, e si sente il vento.");
    const names = items.map((i) => i.name).sort();
    expect(names).toContain("Nebbia");
    expect(names).toContain("Vento");
  });

  it("default status is pending", () => {
    const items = extractAtmosphere("La neve cade leggera.");
    expect(items[0]?.defaultStatus).toBe("pending");
  });
});
