import { describe, it, expect } from "vitest";
import {
  titlePageToFountainKeys,
  titlePageDocToFountainKeys,
  titlePageDocHasContent,
  prependTitlePageToFountain,
} from "./title-page-prepend";
import { EMPTY_TITLE_PAGE } from "~/features/projects";

describe("titlePageToFountainKeys (BUG-N63b — full title page)", () => {
  it("emits all canonical fields, not just title/author/date", () => {
    const lines = titlePageToFountainKeys({
      title: "La città silenziosa",
      titlePage: {
        author: "Valerio Narcisi",
        basedOn: "un racconto di X",
        contact: "valerio@example.com",
        draftDate: "2026-06-13",
        draftColor: null,
        wgaRegistration: "1234567",
        notes: "Bozza di lavorazione",
      },
    });
    const block = lines.join("\n");
    expect(block).toContain("Title: La città silenziosa");
    expect(block).toContain("Credit: Scritto da");
    expect(block).toContain("Author: Valerio Narcisi");
    expect(block).toContain("Source: Tratto da un racconto di X");
    expect(block).toContain("Draft date: 2026-06-13");
    expect(block).toContain("Contact: valerio@example.com");
    expect(block).toContain("Copyright: WGA 1234567");
    expect(block).toContain("Notes: Bozza di lavorazione");
  });

  it("omits empty fields and keeps only the title", () => {
    const lines = titlePageToFountainKeys({
      title: "Solo Titolo",
      titlePage: EMPTY_TITLE_PAGE,
    });
    expect(lines).toEqual(["Title: Solo Titolo"]);
  });

  it("skips the Author/Credit pair when author is blank", () => {
    const lines = titlePageToFountainKeys({
      title: "X",
      titlePage: { ...EMPTY_TITLE_PAGE, contact: "a@b.c" },
    });
    expect(lines.some((l) => l.startsWith("Credit:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("Author:"))).toBe(false);
    expect(lines).toContain("Contact: a@b.c");
  });

  it("collapses newlines inside a field value", () => {
    const lines = titlePageToFountainKeys({
      title: "X",
      titlePage: { ...EMPTY_TITLE_PAGE, notes: "riga uno\nriga due" },
    });
    expect(lines).toContain("Notes: riga uno riga due");
  });
});

describe("prependTitlePageToFountain", () => {
  it("separates the title-page block from the body with a blank line", () => {
    const out = prependTitlePageToFountain("INT. CASA - GIORNO\n\nAzione.", {
      title: "T",
      titlePage: EMPTY_TITLE_PAGE,
    });
    expect(out).toBe("Title: T\n\nINT. CASA - GIORNO\n\nAzione.");
  });
});

// BUG-N63 (WYSIWYG): the export must reproduce the AUTHORED title-page editor
// (`titlePageDoc`), not the scalar TitlePage fields — which are often all null
// while the doc the writer sees is full. Real shape from the dev DB.
describe("titlePageDocToFountainKeys (WYSIWYG cover)", () => {
  const realDoc = {
    type: "doc",
    content: [
      {
        type: "title",
        content: [{ type: "text", text: "Scienze Naturali -  Federico II" }],
      },
      {
        type: "centerBlock",
        content: [
          {
            type: "para",
            content: [{ type: "text", text: "Valerio Narcisi " }],
          },
          { type: "para", content: [{ type: "text", text: "e " }] },
          {
            type: "para",
            content: [{ type: "text", text: "Giordano Viozzi" }],
          },
        ],
      },
      {
        type: "footerLeft",
        content: [
          { type: "para", content: [{ type: "text", text: "2026-06-11" }] },
        ],
      },
      { type: "footerCenter", content: [{ type: "para" }] },
      {
        type: "footerRight",
        content: [
          { type: "para", content: [{ type: "text", text: "valerio@x.it" }] },
        ],
      },
    ],
  };

  it("serializes title + credit lines + footers from the doc", () => {
    const lines = titlePageDocToFountainKeys(realDoc, "Fallback");
    const block = lines.join("\n");
    // Title emboldened to match the editor (BUG-N63).
    expect(block).toContain("Title: **Scienze Naturali -  Federico II**");
    expect(block).toContain("Credit: Valerio Narcisi");
    expect(block).toContain("Giordano Viozzi");
    // Footer mapping: editor footerLeft → afterwriting bottom-left (Notes);
    // footerRight → bottom-right (Draft date). footerCenter empty → no Copyright.
    expect(block).toContain("Notes: 2026-06-11");
    expect(block).toContain("Draft date: valerio@x.it");
    expect(block).not.toContain("Copyright:");
  });

  it("falls back to the project title when the doc title region is empty", () => {
    const lines = titlePageDocToFountainKeys(
      { type: "doc", content: [{ type: "title", content: [] }] },
      "Il Titolo",
    );
    expect(lines[0]).toBe("Title: **Il Titolo**");
  });

  it("maps footerCenter to the bottom-left Copyright slot (no native center)", () => {
    const lines = titlePageDocToFountainKeys(
      {
        type: "doc",
        content: [
          { type: "title", content: [{ type: "text", text: "T" }] },
          {
            type: "footerLeft",
            content: [
              { type: "para", content: [{ type: "text", text: "01/05/2025" }] },
            ],
          },
          {
            type: "footerCenter",
            content: [
              {
                type: "para",
                content: [{ type: "text", text: "documento riservato" }],
              },
            ],
          },
          {
            type: "footerRight",
            content: [
              { type: "para", content: [{ type: "text", text: "tel.333" }] },
            ],
          },
        ],
      },
      "Fallback",
    );
    const block = lines.join("\n");
    expect(block).toContain("Notes: 01/05/2025");
    expect(block).toContain("Copyright: documento riservato");
    expect(block).toContain("Draft date: tel.333");
  });

  it("titlePageDocHasContent: true for an authored doc, false for an empty one", () => {
    expect(titlePageDocHasContent(realDoc)).toBe(true);
    expect(
      titlePageDocHasContent({
        type: "doc",
        content: [
          { type: "title", content: [] },
          { type: "centerBlock", content: [{ type: "para" }] },
          { type: "footerLeft", content: [{ type: "para" }] },
          { type: "footerCenter", content: [{ type: "para" }] },
          { type: "footerRight", content: [{ type: "para" }] },
        ],
      }),
    ).toBe(false);
    expect(titlePageDocHasContent(null)).toBe(false);
  });

  it("prependTitlePageToFountain prefers the doc over the scalar fields", () => {
    const out = prependTitlePageToFountain("INT. X - DAY\n\nA.", {
      title: "Fallback",
      titlePage: { ...EMPTY_TITLE_PAGE, author: "Scalar Author" },
      titlePageDoc: realDoc,
    });
    // The authored doc wins: its title + credit, not the scalar author.
    expect(out).toContain("Title: **Scienze Naturali -  Federico II**");
    expect(out).toContain("Valerio Narcisi");
    expect(out).not.toContain("Scalar Author");
  });
});
