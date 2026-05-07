import { describe, it, expect } from "vitest";
import { stripFountainDialogue } from "./strip-fountain-dialogue.js";

describe("stripFountainDialogue", () => {
  it("keeps action-only bodies unchanged", () => {
    const body = "A FERRARI zooms past.\n\nSmoke fills the room.";
    expect(stripFountainDialogue(body)).toBe(body);
  });

  it("removes dialogue lines after a character cue", () => {
    const body = [
      "A gun lies on the table.",
      "",
      "JORDAN",
      "I'll take that.",
      "",
      "He picks it up.",
    ].join("\n");

    const result = stripFountainDialogue(body);
    expect(result).toContain("A gun lies on the table.");
    expect(result).toContain("He picks it up.");
    expect(result).not.toContain("I'll take that.");
  });

  it("keeps character cue lines (V.O./O.S. info stays)", () => {
    const body = [
      "Empty room.",
      "",
      "JORDAN (V.O.)",
      "The year I turned 26.",
    ].join("\n");

    const result = stripFountainDialogue(body);
    expect(result).toContain("JORDAN (V.O.)");
    expect(result).not.toContain("The year I turned 26.");
  });

  it("does not strip ALL-CAPS action lines embedded in a paragraph", () => {
    // No preceding blank line → not a character cue
    const body = "He screams. BANG! The car explodes.";
    expect(stripFountainDialogue(body)).toBe(body);
  });

  it("handles multiple dialogue blocks", () => {
    const body = [
      "INT. BAR - NIGHT",
      "",
      "ALICE",
      "Get me a beer.",
      "",
      "BOB",
      "Coming right up.",
      "",
      "She sits down.",
    ].join("\n");

    const result = stripFountainDialogue(body);
    expect(result).toContain("She sits down.");
    expect(result).not.toContain("Get me a beer.");
    expect(result).not.toContain("Coming right up.");
  });
});
