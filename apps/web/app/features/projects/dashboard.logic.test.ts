import { describe, it, expect } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import {
  computeProjectCompletion,
  pickCoverGradient,
  formatLastActivityLabel,
} from "./dashboard.logic";

describe("computeProjectCompletion", () => {
  it("returns 0 when nothing is filled", () => {
    expect(
      computeProjectCompletion({ filledDocTypes: [], hasScreenplay: false }),
    ).toBe(0);
  });

  it("gives 20 for screenplay only", () => {
    expect(
      computeProjectCompletion({ filledDocTypes: [], hasScreenplay: true }),
    ).toBe(20);
  });

  it("gives 80 when all four pipeline docs are filled, no screenplay", () => {
    expect(
      computeProjectCompletion({
        filledDocTypes: [
          DocumentTypes.SOGGETTO,
          DocumentTypes.SYNOPSIS,
          DocumentTypes.OUTLINE,
          DocumentTypes.TREATMENT,
        ],
        hasScreenplay: false,
      }),
    ).toBe(80);
  });

  it("caps at 100", () => {
    const result = computeProjectCompletion({
      filledDocTypes: [
        DocumentTypes.SOGGETTO,
        DocumentTypes.SYNOPSIS,
        DocumentTypes.OUTLINE,
        DocumentTypes.TREATMENT,
      ],
      hasScreenplay: true,
    });
    expect(result).toBe(100);
  });

  it("ignores logline (not part of the narrative pipeline)", () => {
    expect(
      computeProjectCompletion({
        filledDocTypes: [DocumentTypes.LOGLINE],
        hasScreenplay: false,
      }),
    ).toBe(0);
  });
});

describe("pickCoverGradient", () => {
  it("is deterministic for the same id", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(pickCoverGradient(id)).toBe(pickCoverGradient(id));
  });

  it("returns a CSS linear-gradient string", () => {
    expect(pickCoverGradient("abc")).toMatch(/^linear-gradient/);
  });

  it("distributes ids across at least two buckets in a small sample", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `id-${i}`);
    const unique = new Set(ids.map(pickCoverGradient));
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("formatLastActivityLabel", () => {
  const now = "2026-05-15T12:00:00Z";

  it("uses 'ora' under a minute", () => {
    expect(
      formatLastActivityLabel({
        updatedAtIso: "2026-05-15T11:59:30Z",
        nowIso: now,
        editorName: "Maria",
        kind: "screenplay_edit",
      }),
    ).toBe("Maria · ora");
  });

  it("formats hours and days", () => {
    expect(
      formatLastActivityLabel({
        updatedAtIso: "2026-05-15T10:00:00Z",
        nowIso: now,
        editorName: "Maria",
        kind: "document_edit",
      }),
    ).toBe("Maria · 2h fa");
    expect(
      formatLastActivityLabel({
        updatedAtIso: "2026-05-12T12:00:00Z",
        nowIso: now,
        editorName: null,
        kind: "screenplay_edit",
      }),
    ).toBe("tu · 3 g fa");
  });

  it("falls back to 'creato' when no editor for project_created", () => {
    expect(
      formatLastActivityLabel({
        updatedAtIso: "2026-05-15T11:00:00Z",
        nowIso: now,
        editorName: null,
        kind: "project_created",
      }),
    ).toBe("creato · 1h fa");
  });
});
