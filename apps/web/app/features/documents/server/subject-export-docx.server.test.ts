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

describe("parseSoggettoMarkdown — markdown/plain fallback", () => {
  it("returns [] for empty input", () => {
    expect(parseSoggettoMarkdown("")).toEqual([]);
    expect(parseSoggettoMarkdown("   \n\n  ")).toEqual([]);
  });

  it("parses heading + paragraph into single plain runs", () => {
    expect(parseSoggettoMarkdown("## Premessa\n\nBody text.")).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Premessa" }] },
      { kind: "paragraph", runs: [{ text: "Body text." }] },
    ]);
  });

  it("parses a heading without body as a single heading", () => {
    expect(parseSoggettoMarkdown("## Mondo")).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Mondo" }] },
    ]);
  });

  it("splits multiple paragraphs under a heading", () => {
    const result = parseSoggettoMarkdown(
      "## Personaggi\n\nPrimo paragrafo.\n\nSecondo paragrafo.\n\nTerzo.",
    );
    expect(result).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Personaggi" }] },
      { kind: "paragraph", runs: [{ text: "Primo paragrafo." }] },
      { kind: "paragraph", runs: [{ text: "Secondo paragrafo." }] },
      { kind: "paragraph", runs: [{ text: "Terzo." }] },
    ]);
  });

  it("skips a fountain title page in markdown fallback", () => {
    const result = parseSoggettoMarkdown(
      "Title: My Movie\nAuthor: X\n===\n\nReal prose here.",
    );
    expect(result).toEqual([
      { kind: "paragraph", runs: [{ text: "Real prose here." }] },
    ]);
  });
});

describe("parseSoggettoMarkdown — ProseMirror HTML (WYSIWYG marks)", () => {
  it("preserves bold and italic inside a paragraph", () => {
    const result = parseSoggettoMarkdown(
      "<p>testo <strong>grassetto</strong> e <em>corsivo</em></p>",
    );
    expect(result).toEqual([
      {
        kind: "paragraph",
        runs: [
          { text: "testo " },
          { text: "grassetto", bold: true },
          { text: " e " },
          { text: "corsivo", italics: true },
        ],
      },
    ]);
  });

  it("merges nested strong+em into a single bold+italic run", () => {
    const result = parseSoggettoMarkdown("<p><strong><em>x</em></strong></p>");
    expect(result).toEqual([
      { kind: "paragraph", runs: [{ text: "x", bold: true, italics: true }] },
    ]);
  });

  it("treats <b>/<i>/<u> aliases as bold/italic/underline", () => {
    const result = parseSoggettoMarkdown("<p><b>a</b><i>b</i><u>c</u></p>");
    expect(result).toEqual([
      {
        kind: "paragraph",
        runs: [
          { text: "a", bold: true },
          { text: "b", italics: true },
          { text: "c", underline: true },
        ],
      },
    ]);
  });

  it("maps <h2>/<h3> to heading blocks and <p> to paragraphs", () => {
    const result = parseSoggettoMarkdown(
      "<h2>Premessa</h2><p>Body <strong>bold</strong>.</p>",
    );
    expect(result).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Premessa" }] },
      {
        kind: "paragraph",
        runs: [{ text: "Body " }, { text: "bold", bold: true }, { text: "." }],
      },
    ]);
  });

  it("decodes entities and drops empty blocks", () => {
    const result = parseSoggettoMarkdown("<p>A &amp; B</p><p></p><p>   </p>");
    expect(result).toEqual([{ kind: "paragraph", runs: [{ text: "A & B" }] }]);
  });
});

describe("buildSoggettoDocxSections", () => {
  const project = (
    over: Partial<Parameters<typeof buildSoggettoDocxSections>[1]> = {},
  ) => ({
    title: "My Movie",
    ownerName: null,
    titlePageAuthor: null,
    basedOn: null,
    draftDate: null,
    everAiTouched: false,
    ...over,
  });

  it("returns only title-page paragraphs when parsed is empty and no author", () => {
    const sections = buildSoggettoDocxSections([], project());
    // title + subtitle only (no author paragraph)
    expect(sections.length).toBe(2);
    expect(sections.every((s) => s instanceof Paragraph)).toBe(true);
  });

  it("includes an author paragraph when ownerName is present (fallback)", () => {
    const sections = buildSoggettoDocxSections(
      [],
      project({ ownerName: "Valerio Narcisi" }),
    );
    expect(sections.length).toBe(3);
    expect(JSON.stringify(sections)).toContain("Scritto da Valerio Narcisi");
  });

  it("prefers the declared title-page author over the account owner name (BUG-N63b)", () => {
    const sections = buildSoggettoDocxSections(
      [],
      project({
        ownerName: "Account Name",
        titlePageAuthor: "Declared Author",
      }),
    );
    const json = JSON.stringify(sections);
    expect(json).toContain("Scritto da Declared Author");
    expect(json).not.toContain("Account Name");
  });

  it("adds a 'Tratto da' line and a draft date when present (BUG-N63b)", () => {
    const sections = buildSoggettoDocxSections(
      [],
      project({
        titlePageAuthor: "A",
        basedOn: "un romanzo di X",
        draftDate: "2026-06-13",
      }),
    );
    const json = JSON.stringify(sections);
    expect(json).toContain("Tratto da un romanzo di X");
    expect(json).toContain("2026-06-13");
    // title + subtitle + basedOn + author + draftDate
    expect(sections.length).toBe(5);
  });

  it("maps heading blocks to HEADING_2 Paragraphs", () => {
    const sections = buildSoggettoDocxSections(
      [
        { kind: "heading", level: 2, runs: [{ text: "Premessa" }] },
        { kind: "paragraph", runs: [{ text: "Body." }] },
      ],
      project({ title: "X" }),
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

  it("emits a bold TextRun for a bold run (WYSIWYG, BUG-N63)", () => {
    const sections = buildSoggettoDocxSections(
      [
        {
          kind: "paragraph",
          runs: [
            { text: "plain " },
            { text: "strong", bold: true },
            { text: " mid " },
            { text: "italic", italics: true },
            { text: " " },
            { text: "under", underline: true },
          ],
        },
      ],
      project({ title: "X" }),
    );
    // title page (2) + paragraph (1)
    const body = sections[2];
    const json = JSON.stringify(body);
    // docx serializes a mark that is ON as an EMPTY element (e.g.
    // `"w:b","root":[]`); a mark explicitly OFF carries `{"val":false}`. So the
    // signature of an ON bold/italic run is the empty `w:b`/`w:i` element, and
    // underline ON is `w:u … "value":"single"`.
    expect(json).toContain('"rootKey":"w:b","root":[]'); // a bold-ON run exists
    expect(json).toContain('"rootKey":"w:i","root":[]'); // an italic-ON run exists
    expect(json).toContain('"value":"single"'); // underline ON
    expect(json).toContain("strong");
    expect(json).toContain("italic");
    expect(json).toContain("under");
  });

  it("does not mark a plain paragraph as bold/italic/underline", () => {
    const sections = buildSoggettoDocxSections(
      [{ kind: "paragraph", runs: [{ text: "just text" }] }],
      project({ title: "X" }),
    );
    const json = JSON.stringify(sections[2]);
    // A plain run never turns a mark ON: no empty w:b/w:i element, no underline.
    expect(json).not.toContain('"rootKey":"w:b","root":[]');
    expect(json).not.toContain('"rootKey":"w:i","root":[]');
    expect(json).not.toContain('"value":"single"');
  });

  it("renders nested bold+italic as one run with both flags", () => {
    const sections = buildSoggettoDocxSections(
      [
        {
          kind: "paragraph",
          runs: [{ text: "both", bold: true, italics: true }],
        },
      ],
      project({ title: "X" }),
    );
    const json = JSON.stringify(sections[2]);
    // One run carries BOTH bold and italic ON (both empty elements present).
    expect(json).toContain('"rootKey":"w:b","root":[]');
    expect(json).toContain('"rootKey":"w:i","root":[]');
    expect(json).toContain("both");
  });
});

describe("buildSoggettoDocxSections — Spec 89 AI disclosure stamp", () => {
  const project = (
    over: Partial<Parameters<typeof buildSoggettoDocxSections>[1]> = {},
  ) => ({
    title: "My Movie",
    ownerName: null,
    titlePageAuthor: null,
    basedOn: null,
    draftDate: null,
    everAiTouched: false,
    ...over,
  });

  it("has no AI disclosure paragraph when never Cesare-touched", () => {
    const sections = buildSoggettoDocxSections([], project());
    expect(JSON.stringify(sections)).not.toContain("Cesare");
  });

  it("appends an AI disclosure paragraph when ever Cesare-touched", () => {
    const sections = buildSoggettoDocxSections(
      [],
      project({ everAiTouched: true }),
    );
    expect(JSON.stringify(sections)).toContain(
      "Questo soggetto contiene testo suggerito da Cesare (AI).",
    );
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
