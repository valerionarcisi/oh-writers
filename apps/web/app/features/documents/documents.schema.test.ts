import { describe, it, expect } from "vitest";
import {
  SiaeExportInputSchema,
  type SiaeExportInput,
} from "./documents.schema";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

const makeValid = (
  overrides: Partial<SiaeExportInput> = {},
): SiaeExportInput => ({
  projectId: VALID_UUID,
  title: "My Screenplay",
  authors: [{ fullName: "Jane Doe", taxCode: null }],
  declaredGenre: "drama",
  estimatedDurationMinutes: 90,
  compilationDate: "2026-04-24",
  depositNotes: null,
  ...overrides,
});

describe("SiaeExportInputSchema", () => {
  it("accepts a valid input", () => {
    expect(SiaeExportInputSchema.safeParse(makeValid()).success).toBe(true);
  });

  it("rejects an empty authors array", () => {
    expect(
      SiaeExportInputSchema.safeParse(makeValid({ authors: [] })).success,
    ).toBe(false);
  });

  it("rejects taxCode longer than 16 chars", () => {
    expect(
      SiaeExportInputSchema.safeParse(
        makeValid({
          authors: [{ fullName: "Jane Doe", taxCode: "A".repeat(17) }],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects estimatedDurationMinutes = 0", () => {
    expect(
      SiaeExportInputSchema.safeParse(
        makeValid({ estimatedDurationMinutes: 0 }),
      ).success,
    ).toBe(false);
  });

  it("rejects estimatedDurationMinutes = 601", () => {
    expect(
      SiaeExportInputSchema.safeParse(
        makeValid({ estimatedDurationMinutes: 601 }),
      ).success,
    ).toBe(false);
  });

  it("accepts estimatedDurationMinutes = 90", () => {
    expect(
      SiaeExportInputSchema.safeParse(
        makeValid({ estimatedDurationMinutes: 90 }),
      ).success,
    ).toBe(true);
  });

  it("rejects an invalid compilationDate", () => {
    expect(
      SiaeExportInputSchema.safeParse(
        makeValid({ compilationDate: "not-a-date" }),
      ).success,
    ).toBe(false);
  });
});
