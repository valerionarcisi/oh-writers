import { describe, it, expect } from "vitest";
import { extractMakeup } from "./extract-makeup.js";

describe("extractMakeup", () => {
  it("matches blood", () => {
    const items = extractMakeup("Ha del sangue sulla camicia.");
    expect(items.find((i) => i.name === "Sangue")).toBeDefined();
  });

  it("matches multiple makeup-SFX cues", () => {
    const items = extractMakeup("Una ferita profonda, un livido sul viso.");
    const names = items.map((i) => i.name).sort();
    expect(names).toContain("Ferita");
    expect(names).toContain("Livido");
  });
});
