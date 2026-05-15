import { describe, expect, it } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import {
  docTypeFromTabId,
  extractTreatmentHeadings,
  routePathFromTabId,
  tabIdFromDocType,
} from "./narrative-shell";

describe("narrative-shell — tab routing", () => {
  it("maps each document type to its tab id", () => {
    expect(tabIdFromDocType(DocumentTypes.SOGGETTO)).toBe("soggetto");
    expect(tabIdFromDocType(DocumentTypes.SYNOPSIS)).toBe("synopsis");
    expect(tabIdFromDocType(DocumentTypes.OUTLINE)).toBe("outline");
    expect(tabIdFromDocType(DocumentTypes.TREATMENT)).toBe("treatment");
  });

  it("returns null for non-narrative document types", () => {
    expect(tabIdFromDocType(DocumentTypes.LOGLINE)).toBeNull();
  });

  it("inverts cleanly", () => {
    expect(docTypeFromTabId("soggetto")).toBe(DocumentTypes.SOGGETTO);
    expect(docTypeFromTabId("synopsis")).toBe(DocumentTypes.SYNOPSIS);
    expect(docTypeFromTabId("outline")).toBe(DocumentTypes.OUTLINE);
    expect(docTypeFromTabId("treatment")).toBe(DocumentTypes.TREATMENT);
  });

  it("builds route paths for the active project", () => {
    expect(routePathFromTabId("synopsis", "abc-123")).toBe(
      "/projects/abc-123/synopsis",
    );
  });
});

describe("narrative-shell — treatment TOC", () => {
  it("returns empty list for empty content", () => {
    expect(extractTreatmentHeadings("")).toEqual([]);
    expect(extractTreatmentHeadings("<p>just a paragraph</p>")).toEqual([]);
  });

  it("extracts h2 and h3 headings in order with stable slugs", () => {
    const html =
      "<h2>Atto Primo</h2><p>...</p><h3>Bologna</h3><p>...</p><h2>Atto Secondo</h2>";
    const out = extractTreatmentHeadings(html);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ level: 2, text: "Atto Primo", id: "atto-primo-0" });
    expect(out[1]?.level).toBe(3);
    expect(out[1]?.text).toBe("Bologna");
    expect(out[2]?.text).toBe("Atto Secondo");
  });

  it("strips inline html and entities from heading text", () => {
    const html = "<h2>Capitolo <em>uno</em> &amp; mezzo</h2>";
    const out = extractTreatmentHeadings(html);
    expect(out[0]?.text).toBe("Capitolo uno & mezzo");
  });

  it("skips empty headings", () => {
    const html = "<h2></h2><h2>Valid</h2>";
    const out = extractTreatmentHeadings(html);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe("Valid");
  });
});
