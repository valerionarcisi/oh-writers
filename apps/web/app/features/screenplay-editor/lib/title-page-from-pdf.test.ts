import { describe, it, expect } from "vitest";
import { extractTitlePageFromPdf } from "./title-page-from-pdf";

const text = (n: { content?: Array<{ text: string }> }): string =>
  (n.content ?? []).map((c) => c.text).join("");

type AnyBlock = {
  content: Array<{ content?: Array<{ text: string }> }>;
};
const paraText = (block: AnyBlock): string[] =>
  block.content.map((p) => text(p));

describe("extractTitlePageFromPdf", () => {
  it("classic visual title page → title + centerBlock + 3-way footer", () => {
    const raw = [
      "",
      "                    THE LAST FRAME",
      "",
      "",
      "                     Written by",
      "",
      "                     Jane Doe",
      "",
      "",
      "",
      "",
      "Draft 3                Acme Pictures               jane@example.com",
      "",
      "",
      "INT. APARTMENT - DAY",
      "",
      "Jane sits at the table.",
    ].join("\n");

    const { doc, consumedLines } = extractTitlePageFromPdf(raw);
    expect(doc).not.toBeNull();
    expect(consumedLines).toBeGreaterThan(0);
    const d = doc!;
    expect(text(d.content[0])).toBe("THE LAST FRAME");
    const center = paraText(d.content[1]);
    expect(center.join(" ")).toMatch(/Written by/);
    expect(center.join(" ")).toMatch(/Jane Doe/);
    expect(paraText(d.content[2])).toEqual(["Draft 3"]);
    expect(paraText(d.content[3])).toEqual(["Acme Pictures"]);
    expect(paraText(d.content[4])).toEqual(["jane@example.com"]);
  });

  it("fountain key:value title page → title + author + footer", () => {
    const raw = [
      "Title: My Pilot",
      "Credit: Written by",
      "Author: Lou Reed",
      "Source: Based on the novel by V.W.",
      "Draft date: 2026-04-22",
      "Contact: lou@example.com",
      "",
      "INT. STREET - NIGHT",
      "",
      "Rain.",
    ].join("\n");

    const { doc } = extractTitlePageFromPdf(raw);
    expect(doc).not.toBeNull();
    const d = doc!;
    expect(text(d.content[0])).toBe("My Pilot");
    const center = paraText(d.content[1]).join(" ");
    expect(center).toMatch(/Lou Reed/);
    expect(center).toMatch(/Based on the novel/);
    expect(paraText(d.content[2])).toContain("2026-04-22");
    expect(paraText(d.content[4])).toContain("lou@example.com");
  });

  it("no title page (slugline on line 1) → null", () => {
    const raw = "INT. ROOM - DAY\n\nA dog sleeps.";
    const { doc, consumedLines } = extractTitlePageFromPdf(raw);
    expect(doc).toBeNull();
    expect(consumedLines).toBe(0);
  });

  it("title-only page → footer paragraphs are empty", () => {
    const raw = [
      "",
      "                  SOLITUDE",
      "",
      "",
      "INT. CAVE - NIGHT",
      "",
      "Echoes.",
    ].join("\n");
    const { doc } = extractTitlePageFromPdf(raw);
    expect(doc).not.toBeNull();
    const d = doc!;
    expect(text(d.content[0])).toBe("SOLITUDE");
    // No 3-column footer = footerLeft holds whatever single line ended up
    // there (possibly the title's own credit), footerCenter/Right are empty.
    expect(d.content[3].content[0]?.content).toBeUndefined();
    expect(d.content[4].content[0]?.content).toBeUndefined();
  });

  it("single-line footer (no triple split) → all in footerLeft", () => {
    const raw = [
      "                MY MOVIE",
      "",
      "                Written by Pat",
      "",
      "",
      "                  draft 2 — april 2026",
      "",
      "INT. KITCHEN - DAY",
      "",
      "Eggs.",
    ].join("\n");
    const { doc } = extractTitlePageFromPdf(raw);
    expect(doc).not.toBeNull();
    const d = doc!;
    expect(text(d.content[0])).toBe("MY MOVIE");
    expect(paraText(d.content[2]).join(" ")).toMatch(/draft 2/);
    expect(d.content[3].content[0]?.content).toBeUndefined();
    expect(d.content[4].content[0]?.content).toBeUndefined();
  });

  it("empty input → null", () => {
    expect(extractTitlePageFromPdf("").doc).toBeNull();
    expect(extractTitlePageFromPdf("   \n   \n").doc).toBeNull();
  });
});
