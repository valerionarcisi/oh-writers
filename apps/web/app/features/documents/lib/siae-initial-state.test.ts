import { describe, it, expect } from "vitest";
import {
  buildSiaeInitialState,
  formatDateYmd,
  toSiaeExportInput,
  DEFAULT_DURATION_MINUTES,
} from "./siae-initial-state";
import { SiaeExportInputSchema } from "../documents.schema";

describe("formatDateYmd", () => {
  it("pads single-digit month and day", () => {
    expect(formatDateYmd(new Date(2025, 0, 3))).toBe("2025-01-03");
  });
});

describe("buildSiaeInitialState", () => {
  const fixedNow = new Date(2026, 3, 24);
  let counter = 0;
  const idFactory = () => `author-${++counter}`;

  it("seeds a single author from the owner name", () => {
    counter = 0;
    const state = buildSiaeInitialState(
      {
        title: "Dune",
        declaredGenre: "sci-fi",
        ownerFullName: "Frank Herbert",
      },
      fixedNow,
      idFactory,
    );
    expect(state).toEqual({
      title: "Dune",
      authors: [{ id: "author-1", fullName: "Frank Herbert", taxCode: null }],
      declaredGenre: "sci-fi",
      estimatedDurationMinutes: DEFAULT_DURATION_MINUTES,
      compilationDate: "2026-04-24",
      depositNotes: "",
    });
  });

  it("seeds one empty author when the owner name is null", () => {
    counter = 0;
    const state = buildSiaeInitialState(
      { title: "Untitled", declaredGenre: "", ownerFullName: null },
      fixedNow,
      idFactory,
    );
    expect(state.authors).toEqual([
      { id: "author-1", fullName: "", taxCode: null },
    ]);
  });
});

describe("toSiaeExportInput", () => {
  it("trims strings and collapses empty deposit notes to null", () => {
    const input = toSiaeExportInput("00000000-0000-0000-0000-000000000001", {
      title: "  Dune  ",
      authors: [
        { id: "x", fullName: "  Frank  ", taxCode: "  RSSMRA00A01H501U  " },
      ],
      declaredGenre: " sci-fi ",
      estimatedDurationMinutes: 120,
      compilationDate: "2026-04-24",
      depositNotes: "   ",
    });
    expect(input).toEqual({
      projectId: "00000000-0000-0000-0000-000000000001",
      title: "Dune",
      authors: [{ fullName: "Frank", taxCode: "RSSMRA00A01H501U" }],
      declaredGenre: "sci-fi",
      estimatedDurationMinutes: 120,
      compilationDate: "2026-04-24",
      depositNotes: null,
    });
    expect(SiaeExportInputSchema.safeParse(input).success).toBe(true);
  });
});
