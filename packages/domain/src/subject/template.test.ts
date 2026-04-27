import { describe, it, expect } from "vitest";
import { SOGGETTO_INITIAL_TEMPLATE } from "./template.js";

describe("SOGGETTO_INITIAL_TEMPLATE", () => {
  it("contains exactly 5 level-2 headings", () => {
    const matches = SOGGETTO_INITIAL_TEMPLATE.match(/^## /gm);
    expect(matches?.length).toBe(5);
  });

  it("lists headings in the canonical order", () => {
    const premise = SOGGETTO_INITIAL_TEMPLATE.indexOf("## Premessa");
    const protagonist = SOGGETTO_INITIAL_TEMPLATE.indexOf(
      "## Protagonista & antagonista",
    );
    const arc = SOGGETTO_INITIAL_TEMPLATE.indexOf("## Arco narrativo");
    const world = SOGGETTO_INITIAL_TEMPLATE.indexOf("## Mondo");
    const ending = SOGGETTO_INITIAL_TEMPLATE.indexOf("## Finale");

    expect(premise).toBeGreaterThanOrEqual(0);
    expect(premise).toBeLessThan(protagonist);
    expect(protagonist).toBeLessThan(arc);
    expect(arc).toBeLessThan(world);
    expect(world).toBeLessThan(ending);
  });

  it("ends with a trailing newline", () => {
    expect(SOGGETTO_INITIAL_TEMPLATE.endsWith("\n")).toBe(true);
  });
});
