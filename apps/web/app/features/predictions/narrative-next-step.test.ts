import { describe, it, expect } from "vitest";
import {
  NARRATIVE_CHAIN,
  nextNarrativeStep,
  narrativeStepFromDomain,
  type NarrativePresence,
  type NarrativeStep,
} from "./narrative-next-step";

// Builds a presence map with the given steps marked as written (true).
const presenceWith = (...written: NarrativeStep[]): NarrativePresence =>
  Object.fromEntries(
    NARRATIVE_CHAIN.map((step) => [step, written.includes(step)]),
  ) as NarrativePresence;

describe("nextNarrativeStep", () => {
  it("suggests the logline for an empty project", () => {
    const next = nextNarrativeStep(presenceWith());
    expect(next?.step).toBe("logline");
    expect(next?.chipLabel).toContain("logline");
    expect(next?.prompt.length).toBeGreaterThan(0);
  });

  it("suggests the soggetto once a logline exists", () => {
    const next = nextNarrativeStep(presenceWith("logline"));
    expect(next?.step).toBe("soggetto");
  });

  it("suggests the synopsis once logline + soggetto exist", () => {
    const next = nextNarrativeStep(presenceWith("logline", "soggetto"));
    expect(next?.step).toBe("synopsis");
  });

  it("suggests the outline once logline → synopsis exist", () => {
    const next = nextNarrativeStep(
      presenceWith("logline", "soggetto", "synopsis"),
    );
    expect(next?.step).toBe("outline");
  });

  it("suggests the treatment once logline → outline exist", () => {
    const next = nextNarrativeStep(
      presenceWith("logline", "soggetto", "synopsis", "outline"),
    );
    expect(next?.step).toBe("treatment");
  });

  it("suggests the screenplay once logline → treatment exist", () => {
    const next = nextNarrativeStep(
      presenceWith("logline", "soggetto", "synopsis", "outline", "treatment"),
    );
    expect(next?.step).toBe("screenplay");
  });

  it("returns null when the whole chain is written (no suggestion)", () => {
    const next = nextNarrativeStep(
      presenceWith(
        "logline",
        "soggetto",
        "synopsis",
        "outline",
        "treatment",
        "screenplay",
      ),
    );
    expect(next).toBeNull();
  });

  it("surfaces the EARLIEST gap even when downstream entities exist out of order", () => {
    // User wrote a treatment first, but no logline/soggetto/synopsis/outline.
    const next = nextNarrativeStep(presenceWith("treatment"));
    expect(next?.step).toBe("logline");
  });

  it("each step's prompt is non-empty Italian copy and the step round-trips", () => {
    for (const step of NARRATIVE_CHAIN) {
      // Presence map where every step up to (but not including) `step` is set.
      const idx = NARRATIVE_CHAIN.indexOf(step);
      const presence = presenceWith(...NARRATIVE_CHAIN.slice(0, idx));
      const next = nextNarrativeStep(presence);
      expect(next?.step).toBe(step);
      expect(next?.prompt.trim().length).toBeGreaterThan(0);
      expect(next?.chipLabel.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("narrativeStepFromDomain", () => {
  it("maps chain domains to their step", () => {
    expect(narrativeStepFromDomain("logline")).toBe("logline");
    expect(narrativeStepFromDomain("outline")).toBe("outline");
    expect(narrativeStepFromDomain("screenplay")).toBe("screenplay");
  });

  it("returns null for non-chain domains", () => {
    expect(narrativeStepFromDomain("budget")).toBeNull();
    expect(narrativeStepFromDomain("locations")).toBeNull();
    expect(narrativeStepFromDomain("breakdown")).toBeNull();
  });
});
