import { describe, it, expect } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import {
  SiaeExportInputSchema,
  SiaeMetadataSchema,
  ContentMaxByType,
  LOGLINE_MAX,
  SOGGETTO_MAX,
  SYNOPSIS_MAX,
  TREATMENT_MAX,
  type SiaeExportInput,
  type SiaeMetadata,
} from "./documents.schema";

describe("ContentMaxByType", () => {
  it("gives soggetto its own long-form cap, distinct from synopsis", () => {
    expect(ContentMaxByType[DocumentTypes.SOGGETTO]).toBe(SOGGETTO_MAX);
    expect(SOGGETTO_MAX).toBeGreaterThan(SYNOPSIS_MAX);
  });

  it("pins the per-type caps", () => {
    expect(ContentMaxByType[DocumentTypes.LOGLINE]).toBe(LOGLINE_MAX);
    expect(ContentMaxByType[DocumentTypes.SYNOPSIS]).toBe(SYNOPSIS_MAX);
    expect(ContentMaxByType[DocumentTypes.TREATMENT]).toBe(TREATMENT_MAX);
    expect(ContentMaxByType[DocumentTypes.OUTLINE]).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

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

const makeValidMetadata = (
  overrides: Partial<SiaeMetadata> = {},
): SiaeMetadata => ({
  title: "Il regista di matrimoni",
  authors: [{ fullName: "Marco Tullio Giordana", taxCode: null }],
  declaredGenre: "commedia",
  estimatedDurationMinutes: 105,
  depositNotes: null,
  ...overrides,
});

describe("SiaeMetadataSchema", () => {
  it("accepts a valid metadata object", () => {
    expect(SiaeMetadataSchema.safeParse(makeValidMetadata()).success).toBe(
      true,
    );
  });

  it("rejects empty title", () => {
    expect(
      SiaeMetadataSchema.safeParse(makeValidMetadata({ title: "" })).success,
    ).toBe(false);
  });

  it("rejects empty authors array", () => {
    expect(
      SiaeMetadataSchema.safeParse(makeValidMetadata({ authors: [] })).success,
    ).toBe(false);
  });

  it("accepts null depositNotes", () => {
    expect(
      SiaeMetadataSchema.safeParse(makeValidMetadata({ depositNotes: null }))
        .success,
    ).toBe(true);
  });

  it("rejects estimatedDurationMinutes = 0", () => {
    expect(
      SiaeMetadataSchema.safeParse(
        makeValidMetadata({ estimatedDurationMinutes: 0 }),
      ).success,
    ).toBe(false);
  });
});
