import { describe, it, expect } from "vitest";
import { fountainToDoc } from "./fountain-to-doc";

const scene = (heading: string, ...body: string[]) =>
  [heading, ...body].join("\n");

describe("fountainToDoc", () => {
  it("parses a scene heading into a scene node with the heading text", () => {
    const doc = fountainToDoc("INT. KITCHEN - DAY\n");
    const firstScene = doc.firstChild!;
    expect(firstScene.type.name).toBe("scene");
    expect(firstScene.firstChild!.type.name).toBe("heading");
    expect(firstScene.firstChild!.textContent).toBe("INT. KITCHEN - DAY");
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
    expect(doc.child(0).firstChild!.textContent).toBe("INT. KITCHEN - DAY");
    expect(doc.child(1).firstChild!.textContent).toBe("EXT. STREET - NIGHT");
  });

  it("returns a minimal valid doc for empty input", () => {
    const doc = fountainToDoc("");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild!.type.name).toBe("scene");
  });

  it("skips blank separator lines — does not create empty nodes", () => {
    const text = ["INT. OFFICE - DAY", "", "", "", "Action line."].join("\n");
    const doc = fountainToDoc(text);
    const scene = doc.firstChild!;
    // heading + 1 action — no blank nodes
    expect(scene.childCount).toBe(2);
  });
});
