import { describe, it, expect } from "vitest";
import { extractTitlePageExportFields } from "./export-fields";

const para = (text?: string) => ({
  type: "para",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

const fullDoc = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "NON FA RIDERE" }] },
    {
      type: "centerBlock",
      content: [para("Written by"), para("Valerio Narcisi & Stefano Teodori")],
    },
    { type: "footerLeft", content: [para("12 giugno 2026")] },
    { type: "footerCenter", content: [para("PRIMA STESURA")] },
    {
      type: "footerRight",
      content: [para("valerio@example.com"), para("+39 333 0000000")],
    },
  ],
};

describe("extractTitlePageExportFields", () => {
  it("extracts every region of a full frontespizio doc", () => {
    const fields = extractTitlePageExportFields(fullDoc);
    expect(fields).toEqual({
      title: "NON FA RIDERE",
      centerLines: ["Written by", "Valerio Narcisi & Stefano Teodori"],
      footerLeftLines: ["12 giugno 2026"],
      footerCenterLines: ["PRIMA STESURA"],
      footerRightLines: ["valerio@example.com", "+39 333 0000000"],
    });
  });

  it("returns empty arrays for empty regions (seed shape)", () => {
    const fields = extractTitlePageExportFields({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "X" }] },
        { type: "centerBlock", content: [para("di Mario Rossi")] },
        { type: "footerLeft", content: [para()] },
        { type: "footerCenter", content: [para()] },
        { type: "footerRight", content: [para()] },
      ],
    });
    expect(fields).toEqual({
      title: "X",
      centerLines: ["di Mario Rossi"],
      footerLeftLines: [],
      footerCenterLines: [],
      footerRightLines: [],
    });
  });

  it("drops whitespace-only paragraphs and trims text", () => {
    const fields = extractTitlePageExportFields({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "  Padded  " }] },
        { type: "centerBlock", content: [para("   "), para(" di Anna ")] },
        { type: "footerLeft", content: [para()] },
        { type: "footerCenter", content: [para()] },
        { type: "footerRight", content: [para()] },
      ],
    });
    expect(fields?.title).toBe("Padded");
    expect(fields?.centerLines).toEqual(["di Anna"]);
  });

  it("returns null for null / non-object input", () => {
    expect(extractTitlePageExportFields(null)).toBeNull();
    expect(extractTitlePageExportFields(undefined)).toBeNull();
    expect(extractTitlePageExportFields("Title")).toBeNull();
  });

  it("returns null for JSON that does not match the title-page schema", () => {
    expect(
      extractTitlePageExportFields({ type: "doc", content: [] }),
    ).toBeNull();
    expect(
      extractTitlePageExportFields({ type: "nonsense", content: [] }),
    ).toBeNull();
  });
});
