import { describe, it, expect } from "vitest";
import {
  buildSiaeInitialState,
  formatDateYmd,
  toSiaeExportInput,
  toSiaeMetadata,
  DEFAULT_DURATION_MINUTES,
  type SiaeFormState,
} from "./siae-initial-state";
import { SiaeExportInputSchema, type SiaeMetadata } from "../documents.schema";

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

const SAVED_METADATA: SiaeMetadata = {
  title: "Pane e tulipani",
  authors: [{ fullName: "Silvio Soldini", taxCode: "SLDSV60A01F205X" }],
  declaredGenre: "commedia romantica",
  estimatedDurationMinutes: 112,
  depositNotes: "Depositato a Venezia",
};

describe("buildSiaeInitialState — with savedMetadata", () => {
  const fixedNow = new Date(2026, 3, 24);
  let counter = 0;
  const idFactory = () => `author-${++counter}`;

  it("uses saved metadata when present, ignoring project defaults", () => {
    counter = 0;
    const state = buildSiaeInitialState(
      {
        title: "Ignored Title",
        declaredGenre: "ignored",
        ownerFullName: "Ignored Owner",
        savedMetadata: SAVED_METADATA,
      },
      fixedNow,
      idFactory,
    );
    expect(state.title).toBe("Pane e tulipani");
    expect(state.authors).toEqual([
      {
        id: "author-1",
        fullName: "Silvio Soldini",
        taxCode: "SLDSV60A01F205X",
      },
    ]);
    expect(state.declaredGenre).toBe("commedia romantica");
    expect(state.estimatedDurationMinutes).toBe(112);
    expect(state.depositNotes).toBe("Depositato a Venezia");
    expect(state.compilationDate).toBe("2026-04-24");
  });

  it("falls back to project defaults when savedMetadata is null", () => {
    counter = 0;
    const state = buildSiaeInitialState(
      {
        title: "Untitled",
        declaredGenre: "drama",
        ownerFullName: "Jane Doe",
        savedMetadata: null,
      },
      fixedNow,
      idFactory,
    );
    expect(state.title).toBe("Untitled");
    expect(state.authors[0]?.fullName).toBe("Jane Doe");
  });
});

describe("toSiaeMetadata", () => {
  it("trims strings and maps authors", () => {
    const state: SiaeFormState = {
      title: "  Dune  ",
      authors: [
        { id: "x", fullName: "  Frank  ", taxCode: "  RSSMRA00A01H501U  " },
      ],
      declaredGenre: " sci-fi ",
      estimatedDurationMinutes: 180,
      compilationDate: "2026-04-24",
      depositNotes: "  note  ",
    };
    expect(toSiaeMetadata(state)).toEqual({
      title: "Dune",
      authors: [{ fullName: "Frank", taxCode: "RSSMRA00A01H501U" }],
      declaredGenre: "sci-fi",
      estimatedDurationMinutes: 180,
      depositNotes: "note",
    });
  });

  it("collapses blank depositNotes to null", () => {
    const state: SiaeFormState = {
      title: "T",
      authors: [{ id: "x", fullName: "F", taxCode: null }],
      declaredGenre: "d",
      estimatedDurationMinutes: 90,
      compilationDate: "2026-04-24",
      depositNotes: "   ",
    };
    expect(toSiaeMetadata(state).depositNotes).toBeNull();
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
