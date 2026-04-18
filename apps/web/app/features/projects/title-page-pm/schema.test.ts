import { describe, it, expect } from "vitest";
import { Node as PMNode } from "prosemirror-model";
import { titlePageSchema } from "./schema";
import { emptyDoc } from "./empty-doc";
import { extractTitle } from "./title-extract";

describe("titlePageSchema", () => {
  it("exposes the 5 region nodes plus para and text", () => {
    const names = Object.keys(titlePageSchema.nodes);
    for (const expected of [
      "doc",
      "title",
      "centerBlock",
      "footerLeft",
      "footerCenter",
      "footerRight",
      "para",
      "text",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("requires every region in fixed order on doc", () => {
    const docContent = titlePageSchema.nodes.doc.spec.content;
    expect(docContent).toBe(
      "title centerBlock footerLeft footerCenter footerRight",
    );
  });

  it("title node accepts only inline text (single paragraph)", () => {
    const title = titlePageSchema.nodes.title;
    expect(title.spec.content).toBe("text*");
    expect(title.spec.isolating).toBe(true);
  });

  it("center + footer regions allow multi-paragraph content", () => {
    for (const name of [
      "centerBlock",
      "footerLeft",
      "footerCenter",
      "footerRight",
    ] as const) {
      expect(titlePageSchema.nodes[name].spec.content).toBe("para+");
      expect(titlePageSchema.nodes[name].spec.isolating).toBe(true);
    }
  });
});

describe("emptyDoc", () => {
  it("builds a valid PM doc with 5 empty regions and the project title in the title node", () => {
    const doc = emptyDoc("My Movie");
    expect(() => doc.check()).not.toThrow();
    expect(doc.firstChild?.type.name).toBe("title");
    expect(doc.firstChild?.textContent).toBe("My Movie");
    const childTypes = Array.from(
      { length: doc.childCount },
      (_, i) => doc.child(i).type.name,
    );
    expect(childTypes).toEqual([
      "title",
      "centerBlock",
      "footerLeft",
      "footerCenter",
      "footerRight",
    ]);
  });

  it("renders empty title when project title is empty", () => {
    const doc = emptyDoc("");
    expect(doc.firstChild?.textContent).toBe("");
  });

  it("round-trips through toJSON / fromJSON", () => {
    const doc = emptyDoc("Roundtrip");
    const json = doc.toJSON();
    const restored = PMNode.fromJSON(titlePageSchema, json);
    expect(restored.eq(doc)).toBe(true);
  });
});

describe("extractTitle", () => {
  it("returns the trimmed text of the title node", () => {
    const doc = emptyDoc("  Hello World  ");
    expect(extractTitle(doc)).toBe("Hello World");
  });

  it("returns empty string when title node is empty", () => {
    const doc = emptyDoc("");
    expect(extractTitle(doc)).toBe("");
  });

  it("works on a JSON doc, not just a PMNode", () => {
    const json = emptyDoc("From JSON").toJSON();
    expect(extractTitle(json)).toBe("From JSON");
  });

  it("returns empty string for malformed input", () => {
    expect(extractTitle(null)).toBe("");
    expect(extractTitle({})).toBe("");
    expect(extractTitle({ content: [] })).toBe("");
  });
});
