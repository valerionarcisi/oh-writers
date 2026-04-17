import { describe, it, expect } from "vitest";
import type { Node } from "prosemirror-model";
import { joinHeading } from "@oh-writers/domain";
import { fountainToDoc } from "./fountain-to-doc";

const scene = (heading: string, ...body: string[]) =>
  [heading, ...body].join("\n");

// heading.textContent concatenates prefix + title with no separator —
// use this helper to reconstruct the original heading line.
const headingLine = (heading: Node): string => {
  let prefix = "";
  let title = "";
  heading.forEach((c) => {
    if (c.type.name === "prefix") prefix = c.textContent;
    else if (c.type.name === "title") title = c.textContent;
  });
  return joinHeading({ prefix, title });
};

describe("fountainToDoc", () => {
  it("parses a scene heading into a scene node with the heading text", () => {
    const doc = fountainToDoc("INT. KITCHEN - DAY\n");
    const firstScene = doc.firstChild!;
    expect(firstScene.type.name).toBe("scene");
    expect(firstScene.firstChild!.type.name).toBe("heading");
    expect(headingLine(firstScene.firstChild!)).toBe("INT. KITCHEN - DAY");
  });

  it("parses action lines", () => {
    const doc = fountainToDoc(
      scene("INT. OFFICE - DAY", "", "A coffee cup steams on the desk."),
    );
    const body = doc.firstChild!.child(1);
    expect(body.type.name).toBe("action");
    expect(body.textContent).toBe("A coffee cup steams on the desk.");
  });

  it("parses character cue with indent", () => {
    const doc = fountainToDoc(scene("INT. OFFICE - DAY", "", "      ANNA"));
    const body = doc.firstChild!.child(1);
    expect(body.type.name).toBe("character");
    expect(body.textContent).toBe("ANNA");
  });

  it("parses plain-Fountain character cue (no indent, ALL CAPS, blank line above)", () => {
    const doc = fountainToDoc(scene("INT. OFFICE - DAY", "", "ANNA"));
    const body = doc.firstChild!.child(1);
    expect(body.type.name).toBe("character");
    expect(body.textContent).toBe("ANNA");
  });

  it("parses dialogue with indent", () => {
    const doc = fountainToDoc(
      scene("INT. OFFICE - DAY", "", "      ANNA", "          Hello there."),
    );
    const dialogue = doc.firstChild!.child(2);
    expect(dialogue.type.name).toBe("dialogue");
    expect(dialogue.textContent).toBe("Hello there.");
  });

  it("parses parenthetical", () => {
    const doc = fountainToDoc(
      scene(
        "INT. OFFICE - DAY",
        "",
        "      ANNA",
        "      (quietly)",
        "          Hello.",
      ),
    );
    const paren = doc.firstChild!.child(2);
    expect(paren.type.name).toBe("parenthetical");
    expect(paren.textContent).toBe("(quietly)");
  });

  it("parses a known transition", () => {
    const doc = fountainToDoc(scene("INT. OFFICE - DAY", "", "CUT TO:"));
    const body = doc.firstChild!.child(1);
    expect(body.type.name).toBe("transition");
    expect(body.textContent).toBe("CUT TO:");
  });

  it("groups multiple scenes correctly", () => {
    const text = [
      "INT. KITCHEN - DAY",
      "",
      "She pours coffee.",
      "",
      "EXT. STREET - NIGHT",
      "",
      "Rain.",
    ].join("\n");
    const doc = fountainToDoc(text);
    expect(doc.childCount).toBe(2);
    expect(headingLine(doc.child(0).firstChild!)).toBe("INT. KITCHEN - DAY");
    expect(headingLine(doc.child(1).firstChild!)).toBe("EXT. STREET - NIGHT");
  });

  it("returns a minimal valid doc for empty input", () => {
    const doc = fountainToDoc("");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild!.type.name).toBe("scene");
  });

  it("classifies unindented lines after character cue as dialogue (PDF import)", () => {
    // PDF importers strip all indentation. Lines after a character cue should
    // still become dialogue nodes via the context-aware fallback.
    const text = [
      "INT. OFFICE - DAY",
      "",
      "JOHN",
      "Ma tua moglie ancora ti vuole a letto?",
      "PUBBLICO",
      "Ma che sarria?",
    ].join("\n");
    const doc = fountainToDoc(text);
    const scene = doc.firstChild!;
    // heading, character(JOHN), dialogue, character(PUBBLICO), dialogue
    expect(scene.child(1).type.name).toBe("character");
    expect(scene.child(2).type.name).toBe("dialogue");
    expect(scene.child(2).textContent).toBe(
      "Ma tua moglie ancora ti vuole a letto?",
    );
    expect(scene.child(3).type.name).toBe("character");
    expect(scene.child(4).type.name).toBe("dialogue");
  });

  it("classifies unindented parenthetical inside dialogue block", () => {
    const text = [
      "INT. OFFICE - DAY",
      "",
      "JOHN",
      "(ridendo)",
      "Ah lo stupeto!",
    ].join("\n");
    const doc = fountainToDoc(text);
    const scene = doc.firstChild!;
    expect(scene.child(1).type.name).toBe("character");
    expect(scene.child(2).type.name).toBe("parenthetical");
    expect(scene.child(3).type.name).toBe("dialogue");
  });

  it("ends dialogue block on blank line — next line is action", () => {
    const text = [
      "INT. OFFICE - DAY",
      "",
      "JOHN",
      "Ciao.",
      "",
      "Silenzio in sala.",
    ].join("\n");
    const doc = fountainToDoc(text);
    const scene = doc.firstChild!;
    expect(scene.child(2).type.name).toBe("dialogue");
    expect(scene.child(3).type.name).toBe("action");
  });

  it("skips blank separator lines — does not create empty nodes", () => {
    const text = ["INT. OFFICE - DAY", "", "", "", "Action line."].join("\n");
    const doc = fountainToDoc(text);
    const scene = doc.firstChild!;
    // heading + 1 action — no blank nodes
    expect(scene.childCount).toBe(2);
  });

  describe("forced scene numbers (shooting-script import)", () => {
    it("reads `INT. FOO #1A#` → scene_number='1A', locked=true", () => {
      const doc = fountainToDoc("INT. KITCHEN - DAY #1A#\n");
      const heading = doc.firstChild!.firstChild!;
      expect(heading.attrs["scene_number"]).toBe("1A");
      expect(heading.attrs["scene_number_locked"]).toBe(true);
      // The `#1A#` suffix is not echoed in the slot text — it only lives on the attr.
      expect(headingLine(heading)).toBe("INT. KITCHEN - DAY");
    });

    it("reads a range suffix like `#3-3B#` verbatim", () => {
      const doc = fountainToDoc("INT. POLAROIDS #3-3B#\n");
      const heading = doc.firstChild!.firstChild!;
      expect(heading.attrs["scene_number"]).toBe("3-3B");
      expect(heading.attrs["scene_number_locked"]).toBe(true);
    });

    it("falls back to sequential + unlocked when no `#...#` marker", () => {
      const doc = fountainToDoc("INT. KITCHEN - DAY\n");
      const heading = doc.firstChild!.firstChild!;
      expect(heading.attrs["scene_number"]).toBe("1");
      expect(heading.attrs["scene_number_locked"]).toBe(false);
    });

    it("keeps every imported heading locked with its original number", () => {
      const text = [
        "INT. ONE #2#",
        "",
        "INT. TWO #3-3B#",
        "",
        "INT. THREE #15A#",
      ].join("\n");
      const doc = fountainToDoc(text);
      const numbers: string[] = [];
      const locks: boolean[] = [];
      doc.forEach((s) => {
        const h = s.firstChild!;
        numbers.push(h.attrs["scene_number"] as string);
        locks.push(h.attrs["scene_number_locked"] as boolean);
      });
      expect(numbers).toEqual(["2", "3-3B", "15A"]);
      expect(locks).toEqual([true, true, true]);
    });
  });
});
