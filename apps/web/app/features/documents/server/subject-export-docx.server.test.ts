import { describe, it, expect } from "vitest";
import { Paragraph, HeadingLevel } from "docx";
import {
  exportSubjectDocx,
  parseSoggettoMarkdown,
  buildSoggettoDocxSections,
  slug,
} from "./subject-export-docx.server";

// Contract-level coverage for the server fn itself. Behavior is tested through
// pure helpers below; the full chain runs in Playwright E2E (Task 10.x).
describe("exportSubjectDocx server fn", () => {
  it("exports exportSubjectDocx as a callable server fn", () => {
    expect(exportSubjectDocx).toBeDefined();
    expect(typeof exportSubjectDocx).toBe("function");
  });
});

describe("parseSoggettoMarkdown", () => {
  it("returns [] for empty input", () => {
    expect(parseSoggettoMarkdown("")).toEqual([]);
    expect(parseSoggettoMarkdown("   \n\n  ")).toEqual([]);
  });

  it("parses heading + paragraph", () => {
    expect(parseSoggettoMarkdown("## Premessa\n\nBody text.")).toEqual([
      { kind: "heading", level: 2, text: "Premessa" },
      { kind: "paragraph", text: "Body text." },
    ]);
  });

  it("parses a heading without body as a single heading", () => {
    expect(parseSoggettoMarkdown("## Mondo")).toEqual([
      { kind: "heading", level: 2, text: "Mondo" },
    ]);
  });

  it("splits multiple paragraphs under a heading", () => {
    const result = parseSoggettoMarkdown(
      "## Personaggi\n\nPrimo paragrafo.\n\nSecondo paragrafo.\n\nTerzo.",
    );
    expect(result).toEqual([
      { kind: "heading", level: 2, text: "Personaggi" },
      { kind: "paragraph", text: "Primo paragrafo." },
      { kind: "paragraph", text: "Secondo paragrafo." },
      { kind: "paragraph", text: "Terzo." },
    ]);
  });
});

describe("buildSoggettoDocxSections", () => {
  it("returns only title-page paragraphs when parsed is empty and no owner", () => {
    const sections = buildSoggettoDocxSections([], {
      title: "My Movie",
      ownerName: null,
    });
    // title + subtitle only (no author paragraph)
    expect(sections.length).toBe(2);
    expect(sections.every((s) => s instanceof Paragraph)).toBe(true);
  });

  it("includes owner paragraph when ownerName is present", () => {
    const sections = buildSoggettoDocxSections([], {
      title: "My Movie",
      ownerName: "Valerio Narcisi",
    });
    expect(sections.length).toBe(3);
  });

  it("maps heading blocks to HEADING_2 Paragraphs", () => {
    const sections = buildSoggettoDocxSections(
      [
        { kind: "heading", level: 2, text: "Premessa" },
        { kind: "paragraph", text: "Body." },
      ],
      { title: "X", ownerName: null },
    );
    // title page (2) + heading (1) + paragraph (1) = 4
    expect(sections.length).toBe(4);
    // Heading paragraph serializes the Heading2 style into its properties tree.
    // Probe the serialized JSON rather than a specific nesting path so the test
    // survives docx-lib refactors.
    const headingParagraph = sections[2];
    const paragraphBody = sections[3];
    const headingJson = JSON.stringify(headingParagraph);
    const bodyJson = JSON.stringify(paragraphBody);
    expect(HeadingLevel.HEADING_2).toBe("Heading2");
    expect(headingJson).toContain("Heading2");
    expect(bodyJson).not.toContain("Heading2");
  });
});

describe("slug", () => {
  it("lowercases and replaces non-alphanumerics with dashes", () => {
    expect(slug("My Movie!")).toBe("my-movie");
    expect(slug("  Héllo – World  ")).toBe("h-llo-world");
  });

  it("falls back to 'soggetto' when the input has no alphanumerics", () => {
    expect(slug("   ")).toBe("soggetto");
    expect(slug("!!!")).toBe("soggetto");
  });
});
