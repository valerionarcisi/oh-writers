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

  it("[#51] splits TWO cues colliding on one line (blank line before the 2nd cue)", () => {
    expect(splitInlineCues("FILIPPO Giulio — GIULIO Go.")).toBe(
      "FILIPPO\nGiulio\n\nGIULIO\nGo.",
    );
  });

  it("[#51] splits THREE cues recursively on one line (blank before each later cue)", () => {
    expect(
      splitInlineCues("FILIPPO I have to — THE NONNO Go. — GIULIO Work."),
    ).toBe("FILIPPO\nI have to\n\nTHE NONNO\nGo.\n\nGIULIO\nWork.");
  });

  it("[#51] does NOT split a dash that is not a cue boundary (Title-case / no lowercase speech)", () => {
    // "Giulio" is Title-case (not a cue) — em dash is just prose punctuation.
    expect(splitInlineCues("GIULIO Vado a Roma — poi torno.")).toBe(
      "GIULIO\nVado a Roma — poi torno.",
    );
    // ALL-CAPS after the dash but no lowercase speech follows → not a cue.
    expect(splitInlineCues("GIULIO Da ROMA a NAPOLI.")).toBe(
      "GIULIO\nDa ROMA a NAPOLI.",
    );
  });

  it("[#53] inserts the blank line a cue needs when cues are stacked with no separators", () => {
    // The real #53 symptom: consecutive "CUE speech" lines with NO blank lines.
    // Each must end up as cue + dialogue WITH a blank line before every cue,
    // else the parser folds the next cue into the previous dialogue block.
    expect(splitInlineCues("FILIPPO Comici. Open mic.\nGIULIO Dodici.")).toBe(
      "FILIPPO\nComici. Open mic.\n\nGIULIO\nDodici.",
    );
  });

  it("[#51] multi-cue split is idempotent", () => {
    const once = splitInlineCues("FILIPPO Giulio — GIULIO Go.");
    expect(splitInlineCues(once)).toBe(once);
  });

  it("is idempotent — running twice equals running once", () => {
    const raw = "GIULIO Give them the marinara.\nFILIPPO With or without?";
    const once = splitInlineCues(raw);
    expect(splitInlineCues(once)).toBe(once);
  });

  it("[#53] golden fixture: a fully broken Cesare scene parses to sane DIALOGUE distribution", () => {
    // A realistic chunk of the way Cesare mis-formats a whole scene: every cue
    // collides with its speech, some lines collide TWO cues. After the pass it
    // must parse to real character + dialogue nodes, and NO "CUE speech"
    // one-liner may survive in the canonical Fountain.
    const broken = [
      "INT. OPEN GREZZO - NIGHT",
      "",
      "A cramped comedy club. Mismatched chairs.",
      "",
      "FILIPPO Comici. Open mic. Si chiama l'Open Grezzo.",
      "GIULIO Grezzo.",
      "FILIPPO Dodici.",
      "GIULIO Comici.",
      "FILIPPO Giulio — GIULIO Vai.",
      "TEA Vuoi dirmi qualcosa?",
    ].join("\n");

    const canonical = docToFountain(fountainToDoc(splitInlineCues(broken)));
    const doc = fountainToDoc(canonical);

    const counts: Record<string, number> = {};
    doc.descendants((n) => {
      counts[n.type.name] = (counts[n.type.name] ?? 0) + 1;
      return true;
    });

    // Every cue (FILIPPO ×3, GIULIO ×2, TEA ×1) became a character node, each
    // paired with a dialogue node — a sane distribution, not a wall of action.
    expect(counts["character"] ?? 0).toBeGreaterThanOrEqual(6);
    expect(counts["dialogue"] ?? 0).toBeGreaterThanOrEqual(6);

    // No "CUE speech" one-liner survives: no action/paragraph line starts with
    // an ALL-CAPS cue immediately followed by lowercase-bearing speech.
    for (const line of canonical.split("\n")) {
      const t = line.trim();
      if (t.startsWith("INT.") || t.startsWith("EXT.")) continue;
      expect(t).not.toMatch(/^[A-ZÀ-Ý][A-ZÀ-Ý ]+\s+\p{Ll}/u);
    }
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
