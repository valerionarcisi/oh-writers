import { describe, it, expect } from "vitest";
import {
  titlePageToFountainKeys,
  prependTitlePageToFountain,
} from "./title-page-prepend";
import { EMPTY_TITLE_PAGE } from "~/features/projects/title-page.schema";

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
