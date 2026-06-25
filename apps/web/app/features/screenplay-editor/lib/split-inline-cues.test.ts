import { describe, it, expect } from "vitest";
import { splitInlineCues } from "./split-inline-cues";
import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";

// BUG #46 — Cesare-generated screenplays put the cue + dialogue on one line.
// splitInlineCues repairs that BEFORE the editor's parser sees it.

describe("[#46] splitInlineCues", () => {
  it("splits 'CUE dialogue' onto two lines", () => {
    expect(splitInlineCues("FILIPPO Table four wants the marinara.")).toBe(
      "FILIPPO\nTable four wants the marinara.",
    );
    expect(splitInlineCues("GIULIO And?")).toBe("GIULIO\nAnd?");
  });

  it("handles a cue with a parenthetical extension", () => {
    expect(splitInlineCues("JOHN (CONT'D) Twelve comedians.")).toBe(
      "JOHN (CONT'D)\nTwelve comedians.",
    );
    expect(splitInlineCues("MARCO (V.O.) Non sei più qui.")).toBe(
      "MARCO (V.O.)\nNon sei più qui.",
    );
  });

  it("trims stray leading/trailing whitespace the model emits", () => {
    expect(splitInlineCues("   GIULIO With.   ")).toBe("GIULIO\nWith.");
  });

  it("does NOT touch a scene heading", () => {
    expect(splitInlineCues("INT. KITCHEN / OVEN - NIGHT")).toBe(
      "INT. KITCHEN / OVEN - NIGHT",
    );
  });

  it("does NOT touch a transition", () => {
    expect(splitInlineCues("FADE TO BLACK.")).toBe("FADE TO BLACK.");
    expect(splitInlineCues("CUT TO:")).toBe("CUT TO:");
  });

  it("does NOT touch a cue already on its own line (no lowercase remainder)", () => {
    expect(splitInlineCues("GIULIO")).toBe("GIULIO");
    // two cue-like all-caps words with no lowercase speech are left alone
    expect(splitInlineCues("FILIPPO MARCO")).toBe("FILIPPO MARCO");
  });

  it("leaves normal action prose untouched", () => {
    const action =
      "Filippo pushes through the swing door, order ticket in hand.";
    expect(splitInlineCues(action)).toBe(action);
  });

  it("does NOT split Title-case action that names a character (FILIPPO vs Filippo)", () => {
    // Real action names characters in Title case, never ALL-CAPS — so a line
    // starting "Filippo …" is action and must survive; only an ALL-CAPS prefix
    // is treated as a cue. This is the false-positive guard.
    const action =
      "Filippo moves between the tables, tray balanced, head down.";
    expect(splitInlineCues(action)).toBe(action);
    const single = "Filippo watches from behind the bar.";
    expect(splitInlineCues(single)).toBe(single);
  });

  it("is idempotent — running twice equals running once", () => {
    const raw = "GIULIO Give them the marinara.\nFILIPPO With or without?";
    const once = splitInlineCues(raw);
    expect(splitInlineCues(once)).toBe(once);
  });

  it("end-to-end: a one-line-dialogue scene round-trips to real DIALOGUE, not action", () => {
    const broken = [
      "INT. KITCHEN - NIGHT",
      "",
      "The oven dominates the room.",
      "",
      "GIULIO And?",
      "FILIPPO They still want it without oregano.",
    ].join("\n");
    // Without the pre-split the parser would tag the cue lines as action.
    const fixed = docToFountain(fountainToDoc(splitInlineCues(broken)));
    const doc = fountainToDoc(fixed);
    // Walk the doc: there must be character + dialogue nodes (not all action).
    const types = new Set<string>();
    doc.descendants((n) => {
      types.add(n.type.name);
      return true;
    });
    expect(types.has("character")).toBe(true);
    expect(types.has("dialogue")).toBe(true);
  });
});
