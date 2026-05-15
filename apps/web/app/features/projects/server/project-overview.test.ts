import { describe, it, expect } from "vitest";
import {
  toPreview,
  countWords,
  daysSince,
  estimateMinutes,
  buildNextStep,
  type BreakdownSummary,
  type BudgetSummary,
} from "./project-overview.server";

describe("toPreview", () => {
  it("returns short content untouched", () => {
    expect(toPreview("hello world")).toBe("hello world");
  });

  it("trims whitespace before measuring", () => {
    expect(toPreview("   hello   ")).toBe("hello");
  });

  it("truncates long content with ellipsis", () => {
    const long = "x".repeat(300);
    const out = toPreview(long);
    expect(out.length).toBe(220);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("countWords", () => {
  it("returns 0 for empty content", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });

  it("counts whitespace-separated words", () => {
    expect(countWords("uno due tre")).toBe(3);
    expect(countWords("  uno   due\ntre ")).toBe(3);
  });
});

describe("daysSince", () => {
  it("returns 0 for now", () => {
    const now = new Date("2026-05-15T12:00:00Z");
    expect(daysSince(now.toISOString(), now)).toBe(0);
  });

  it("returns whole days elapsed", () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const fiveDaysAgo = new Date("2026-05-10T12:00:00Z").toISOString();
    expect(daysSince(fiveDaysAgo, now)).toBe(5);
  });

  it("never returns negative", () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const future = new Date("2026-05-20T12:00:00Z").toISOString();
    expect(daysSince(future, now)).toBe(0);
  });
});

describe("estimateMinutes", () => {
  it("uses the one-page-one-minute industry heuristic", () => {
    expect(estimateMinutes(0)).toBe(0);
    expect(estimateMinutes(9)).toBe(9);
    expect(estimateMinutes(120)).toBe(120);
  });

  it("never returns negative", () => {
    expect(estimateMinutes(-3)).toBe(0);
  });
});

const emptyBreakdown: BreakdownSummary = {
  scenesBrokenDown: 0,
  totalScenes: 0,
  hasAny: false,
};
const emptyBudget: BudgetSummary = {
  totalEUR: 0,
  lineCount: 0,
  status: "draft",
  hasAny: false,
};

describe("buildNextStep", () => {
  it("returns null when there is no screenplay yet", () => {
    expect(
      buildNextStep({
        hasScreenplay: false,
        pageCount: 0,
        sceneCount: 0,
        breakdown: emptyBreakdown,
        budget: emptyBudget,
        idleDays: 0,
        projectId: "p1",
      }),
    ).toBeNull();
  });

  it("suggests starting the breakdown when scenes exist but no breakdown", () => {
    const step = buildNextStep({
      hasScreenplay: true,
      pageCount: 9,
      sceneCount: 12,
      breakdown: { scenesBrokenDown: 0, totalScenes: 12, hasAny: false },
      budget: emptyBudget,
      idleDays: 4,
      projectId: "p1",
    });
    expect(step?.actionLabel).toBe("Avvia spoglio");
    expect(step?.actionHref).toBe("/projects/p1/breakdown");
    expect(step?.suggestion).toContain("4 giorni");
  });

  it("suggests generating budget when breakdown exists but no budget", () => {
    const step = buildNextStep({
      hasScreenplay: true,
      pageCount: 9,
      sceneCount: 12,
      breakdown: { scenesBrokenDown: 10, totalScenes: 12, hasAny: true },
      budget: emptyBudget,
      idleDays: 1,
      projectId: "p1",
    });
    expect(step?.actionLabel).toBe("Genera budget");
    expect(step?.actionHref).toBe("/projects/p1/budget");
  });

  it("returns null when both breakdown and budget already exist", () => {
    const step = buildNextStep({
      hasScreenplay: true,
      pageCount: 9,
      sceneCount: 12,
      breakdown: { scenesBrokenDown: 10, totalScenes: 12, hasAny: true },
      budget: { totalEUR: 1000, lineCount: 5, status: "draft", hasAny: true },
      idleDays: 0,
      projectId: "p1",
    });
    expect(step).toBeNull();
  });
});
