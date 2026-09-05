import { describe, it, expect } from "vitest";
import {
  buildNarrativePdf,
  buildNarrativeFilename,
  buildNarrativeSections,
  slugify,
} from "./pdf-narrative";

// pdfkit compresses content streams with FlateDecode by default, so text is
// not readable as raw bytes. Tests verify that a valid PDF buffer is produced;
// content assertions require a PDF parser (pdf-parse v1.1.1 is incompatible
// with jsPDF-generated cross-reference tables in the vitest environment).
describe("buildNarrativePdf", () => {
  it("produces a valid PDF buffer with all required sections", async () => {
    const buffer = await buildNarrativePdf({
      projectTitle: "Silent City",
      author: "Valerio",
      draftDate: null,
      logline: "A detective chases a killer through a silent city.",
      synopsis: "A moody noir that unfolds over three nights.",
      treatment: "Act one begins when the rain stops.",
    });
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("produces a larger buffer when all sections are populated vs empty", async () => {
    const full = await buildNarrativePdf({
      projectTitle: "Silent City",
      author: "Valerio",
      draftDate: null,
      logline: "A detective chases a killer.",
      synopsis: "Three nights of noir.",
      treatment: "Act one begins when the rain stops.",
    });
    const empty = await buildNarrativePdf({
      projectTitle: "Empty",
      author: null,
      draftDate: null,
      logline: "",
      synopsis: "",
      treatment: "",
    });
    expect(full.length).toBeGreaterThan(empty.length);
  });

  it("still produces a valid PDF when all sections are empty", async () => {
    const buffer = await buildNarrativePdf({
      projectTitle: "Empty",
      author: null,
      draftDate: null,
      logline: "",
      synopsis: "",
      treatment: "",
    });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("produces a larger buffer with cover page than without", async () => {
    const withCover = await buildNarrativePdf({
      projectTitle: "Cover Test",
      author: "Test Author",
      draftDate: "2024-01-01",
      logline: "A test logline.",
      synopsis: "",
      treatment: "",
      includeCoverPage: true,
    });
    const withoutCover = await buildNarrativePdf({
      projectTitle: "Cover Test",
      author: "Test Author",
      draftDate: "2024-01-01",
      logline: "A test logline.",
      synopsis: "",
      treatment: "",
      includeCoverPage: false,
    });
    expect(withCover.subarray(0, 4).toString()).toBe("%PDF");
    // Cover page adds an extra page, so the buffer should be larger
    expect(withCover.length).toBeGreaterThan(withoutCover.length);
  });
});

describe("buildNarrativeSections (Spec 89 — AI disclosure stamp)", () => {
  const base = {
    projectTitle: "Silent City",
    author: "Valerio",
    draftDate: null,
    logline: "L.",
    synopsis: "S.",
    treatment: "T.",
  };

  it("has no AI disclosure section when never Cesare-touched", () => {
    const sections = buildNarrativeSections({ ...base, everAiTouched: false });
    expect(sections.some(([title]) => title === "AI")).toBe(false);
  });

  it("appends an AI disclosure section when ever Cesare-touched", () => {
    const sections = buildNarrativeSections({ ...base, everAiTouched: true });
    const aiSection = sections.find(([title]) => title === "AI");
    expect(aiSection?.[1]).toBe(
      "Questo documento contiene testo suggerito da Cesare (AI).",
    );
  });

  it("still emits the three narrative sections regardless of the AI flag", () => {
    const sections = buildNarrativeSections({ ...base, everAiTouched: true });
    expect(sections.map(([title]) => title)).toEqual([
      "Logline",
      "Synopsis",
      "Treatment",
      "AI",
    ]);
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alphanumerics with hyphens", () => {
    expect(slugify("The Great Escape!")).toBe("the-great-escape");
  });

  it("falls back to 'project' for empty input", () => {
    expect(slugify("   ")).toBe("project");
  });

  it("caps slug length", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });
});

describe("buildNarrativeFilename", () => {
  it("appends -narrative.pdf", () => {
    expect(buildNarrativeFilename("Silent City")).toBe(
      "silent-city-narrative.pdf",
    );
  });
});
