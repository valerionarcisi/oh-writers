import { describe, it, expect } from "vitest";
// @ts-expect-error — pdf-parse has no types for its internal entry
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import {
  buildNarrativePdf,
  buildNarrativeFilename,
  slugify,
} from "./pdf-narrative";

describe("buildNarrativePdf", () => {
  it("produces a non-empty PDF buffer", async () => {
    const buffer = await buildNarrativePdf({
      projectTitle: "The Test",
      author: "Jane Doe",
      draftDate: "2026-04-17",
      logline: "A line.",
      synopsis: "A synopsis.",
      treatment: "A treatment.",
    });
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("contains the cover page title and the three section headers", async () => {
    const buffer = await buildNarrativePdf({
      projectTitle: "Silent City",
      author: "Valerio",
      draftDate: null,
      logline: "A detective chases a killer through a silent city.",
      synopsis: "A moody noir that unfolds over three nights.",
      treatment: "Act one begins when the rain stops.",
    });
    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain("SILENT CITY");
    expect(parsed.text).toContain("LOGLINE");
    expect(parsed.text).toContain("SYNOPSIS");
    expect(parsed.text).toContain("TREATMENT");
    expect(parsed.text).toContain("detective chases a killer");
    expect(parsed.text).toContain("Act one begins");
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

  // NOTE: pdf-parse v1.1.1 has shared-worker state and only reliably parses
  // ONE PDF per vitest run. Additional text assertions are folded into the
  // "contains the cover page title and the three section headers" test above.
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
