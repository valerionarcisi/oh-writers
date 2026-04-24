import { describe, it, expect } from "vitest";
import { getNarrativeSchema } from "./narrative-schema";
import { findSubjectHeadings } from "./subject-headings";

describe("findSubjectHeadings", () => {
  it("matches the 5 canonical sections via heading nodes (IT labels)", () => {
    const schema = getNarrativeSchema(true);
    const h = schema.nodes["heading"];
    if (!h) throw new Error("heading node required");
    const p = schema.nodes["paragraph"];
    if (!p) throw new Error("paragraph node required");
    const labels: Array<[string, string]> = [
      ["premise", "Premessa"],
      ["protagonist", "Protagonista & antagonista"],
      ["arc", "Arco narrativo"],
      ["world", "Mondo"],
      ["ending", "Finale"],
    ];
    const doc = schema.node(
      "doc",
      null,
      labels.map(([, label]) => h.create({ level: 2 }, schema.text(label))),
    );

    const found = findSubjectHeadings(doc);
    expect(found.map((x) => x.section)).toEqual(labels.map(([s]) => s));
    expect(found.every((x) => x.pos >= 0)).toBe(true);
    // positions should be strictly increasing
    for (let i = 1; i < found.length; i += 1) {
      const prev = found[i - 1];
      const curr = found[i];
      if (!prev || !curr) throw new Error("unexpected");
      expect(curr.pos).toBeGreaterThan(prev.pos);
    }
  });

  it("matches EN fallback labels", () => {
    const schema = getNarrativeSchema(true);
    const h = schema.nodes["heading"];
    if (!h) throw new Error("heading node required");
    const doc = schema.node("doc", null, [
      h.create({ level: 2 }, schema.text("Premise")),
      h.create({ level: 2 }, schema.text("Ending")),
    ]);
    const found = findSubjectHeadings(doc);
    expect(found.map((x) => x.section)).toEqual(["premise", "ending"]);
  });

  it("ignores unrelated level-2 headings", () => {
    const schema = getNarrativeSchema(true);
    const h = schema.nodes["heading"];
    if (!h) throw new Error("heading node required");
    const doc = schema.node("doc", null, [
      h.create({ level: 2 }, schema.text("Random")),
      h.create({ level: 2 }, schema.text("Premessa")),
    ]);
    const found = findSubjectHeadings(doc);
    expect(found.map((x) => x.section)).toEqual(["premise"]);
  });
});
