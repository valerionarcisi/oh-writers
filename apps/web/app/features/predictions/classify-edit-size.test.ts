import { describe, it, expect } from "vitest";
import { classifyEditSize, LARGE_EDIT_WORDS } from "./classify-edit-size";

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("[OHW-N66] classifyEditSize", () => {
  it("a one-word tweak on a long doc is small", () => {
    const base = words(300);
    const next = base.replace("w0", "changed");
    expect(classifyEditSize(base, next)).toBe("small");
  });

  it("rewriting most of a doc is large (ratio threshold)", () => {
    const base = words(50);
    // Replace ~half the words ⇒ changed-word ratio well over LARGE_EDIT_RATIO.
    const next = words(25) + " " + words(25).replace(/w/g, "x");
    expect(classifyEditSize(base, next)).toBe("large");
  });

  it("a big append to a short doc is large (absolute-count threshold)", () => {
    const base = words(10);
    // Append far more than LARGE_EDIT_WORDS new words ⇒ large even though the
    // ratio maths and absolute maths both point the same way here.
    const next = base + " " + words(LARGE_EDIT_WORDS + 50);
    expect(classifyEditSize(base, next)).toBe("large");
  });

  it("an identical edit is small (no changed words)", () => {
    const base = words(100);
    expect(classifyEditSize(base, base)).toBe("small");
  });

  it("a first write (empty previous) is large", () => {
    expect(classifyEditSize("", words(20))).toBe("large");
    expect(classifyEditSize("   ", words(5))).toBe("large");
  });

  it("is deterministic", () => {
    const a = words(80);
    const b = a.replace("w1", "z").replace("w2", "y");
    const first = classifyEditSize(a, b);
    const second = classifyEditSize(a, b);
    expect(first).toBe(second);
  });

  it("sits just under the ratio boundary ⇒ small", () => {
    // A word-level REPLACEMENT counts as both a deletion and an insertion, so
    // replacing K words contributes ~2K changed words. To stay under
    // LARGE_EDIT_RATIO (0.4) on a 200-word doc, replace ~30 words (~60 changed
    // / 200 = 0.3 < 0.4).
    const base = words(200);
    const replaceCount = 30;
    let next = base;
    for (let i = 0; i < replaceCount; i++) {
      next = next.replace(new RegExp(`\\bw${i}\\b`), `z${i}`);
    }
    expect(classifyEditSize(base, next)).toBe("small");
  });

  it("#36: a full rewrite of a tiny doc (logline) stays small — ratio is disabled below the min-words floor", () => {
    // A logline is ~12 words. "Rendi più corta" rewrites most of it → ratio
    // well over 0.4, but a handful of changed words is not a "large edit".
    // Before the fix this tripped the ASK card on every short-doc edit (#36).
    const base = words(12);
    const next = words(8).replace(/w/g, "x");
    expect(classifyEditSize(base, next)).toBe("small");
  });

  it("#36: the same big-ratio edit on a doc at the floor IS large", () => {
    // At exactly the min-words floor the ratio branch is back in play, so a
    // large relative change classifies as large — the floor only spares docs
    // too short for a percentage to be meaningful.
    const base = words(40);
    let next = base;
    for (let i = 0; i < 15; i++) {
      next = next.replace(new RegExp(`\\bw${i}\\b`), `z${i}`);
    }
    // ~30 changed / 40 = 0.75 ≥ 0.4, and prevWords (40) ≥ the floor.
    expect(classifyEditSize(base, next)).toBe("large");
  });

  it("#36: a huge append to a tiny doc is still large (absolute floor survives)", () => {
    // The floor disables only the RATIO branch; a genuinely big absolute change
    // to a short doc still asks.
    const base = words(5);
    const next = base + " " + words(LARGE_EDIT_WORDS + 10);
    expect(classifyEditSize(base, next)).toBe("large");
  });

  it("a replacement of half the words trips the ratio (replacement = del+add)", () => {
    const base = words(100);
    let next = base;
    for (let i = 0; i < 30; i++) {
      next = next.replace(new RegExp(`\\bw${i}\\b`), `z${i}`);
    }
    // ~60 changed words / 100 = 0.6 ≥ LARGE_EDIT_RATIO.
    expect(classifyEditSize(base, next)).toBe("large");
  });
});
