import { describe, it, expect } from "vitest";
import { schema } from "./schema";
import { docToFountain } from "./doc-to-fountain";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

const makeDoc = (...scenes: ReturnType<typeof makeScene>[]) =>
  schema.node("doc", null, scenes);

const makeScene = (
  heading: string,
  ...body: Array<{ type: string; text: string }>
) => {
  const headingNode = schema.node(
    "heading",
    null,
    heading ? [schema.text(heading)] : [],
  );
  const bodyNodes = body.map(({ type, text }) =>
    schema.node(type, null, text ? [schema.text(text)] : []),
  );
  return schema.node("scene", null, [headingNode, ...bodyNodes]);
};

describe("docToFountain", () => {
  it("emits scene heading at column 0", () => {
    const doc = makeDoc(makeScene("INT. KITCHEN - DAY"));
    expect(docToFountain(doc)).toContain("INT. KITCHEN - DAY");
  });

  it("emits action with a blank line before it", () => {
    const doc = makeDoc(
      makeScene("INT. OFFICE - DAY", { type: "action", text: "Rain." }),
    );
    const output = docToFountain(doc);
    expect(output).toContain("\nRain.");
  });

  it("emits character with CHARACTER_INDENT", () => {
    const doc = makeDoc(
      makeScene("INT. OFFICE - DAY", { type: "character", text: "ANNA" }),
    );
    const output = docToFountain(doc);
    expect(output).toContain(`${CHARACTER_INDENT}ANNA`);
  });

  it("emits dialogue with DIALOGUE_INDENT", () => {
    const doc = makeDoc(
      makeScene("INT. OFFICE - DAY", {
        type: "dialogue",
        text: "Hello there.",
      }),
    );
    const output = docToFountain(doc);
    expect(output).toContain(`${DIALOGUE_INDENT}Hello there.`);
  });

  it("emits parenthetical with CHARACTER_INDENT", () => {
    const doc = makeDoc(
      makeScene("INT. OFFICE - DAY", {
        type: "parenthetical",
        text: "(quietly)",
      }),
    );
    const output = docToFountain(doc);
    expect(output).toContain(`${CHARACTER_INDENT}(quietly)`);
  });

  it("emits transition at column 0", () => {
    const doc = makeDoc(
      makeScene("INT. OFFICE - DAY", {
        type: "transition",
        text: "CUT TO:",
      }),
    );
    const output = docToFountain(doc);
    expect(output).toContain("CUT TO:");
    // Must NOT be indented
    const lines = output.split("\n");
    const transLine = lines.find((l) => l.includes("CUT TO:"))!;
    expect(transLine).toBe("CUT TO:");
  });

  it("separates scenes with blank lines", () => {
    const doc = makeDoc(
      makeScene("INT. KITCHEN - DAY"),
      makeScene("EXT. STREET - NIGHT"),
    );
    const output = docToFountain(doc);
    expect(output).toMatch(/INT\. KITCHEN - DAY\n\nEXT\. STREET - NIGHT/);
  });

  it("ends with a single trailing newline", () => {
    const doc = makeDoc(makeScene("INT. OFFICE - DAY"));
    const output = docToFountain(doc);
    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
  });
});
