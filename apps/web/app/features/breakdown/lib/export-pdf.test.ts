import { describe, it, expect } from "vitest";
import {
  breakdownPdfGroups,
  breakdownPdfDocument,
  type PdfRow,
} from "./export-pdf";

describe("breakdownPdfGroups (BUG-N63d — export fidelity)", () => {
  it("emits EVERY scene an element appears in (no 6-scene cap, no ellipsis)", () => {
    const rows: PdfRow[] = [
      {
        category: "props",
        name: "Pistola",
        totalQuantity: 1,
        scenes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    ];
    const [group] = breakdownPdfGroups(rows);
    const line = group!.elements[0]!;
    expect(line).toContain("1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12");
    expect(line).not.toContain("…");
  });

  it("uses the IT category label, never the English one", () => {
    const rows: PdfRow[] = [
      { category: "props", name: "Pistola", totalQuantity: 1, scenes: [1] },
    ];
    const [group] = breakdownPdfGroups(rows);
    // props.labelIt === "Oggetti"; the EN "Props" must not leak into the PDF.
    expect(group!.header).toBe("Oggetti (1)");
    expect(group!.header).not.toContain("Props");
  });

  it("groups elements by category with a per-category count", () => {
    const rows: PdfRow[] = [
      { category: "props", name: "A", totalQuantity: 1, scenes: [1] },
      { category: "props", name: "B", totalQuantity: 2, scenes: [2] },
      { category: "cast", name: "MARCO", totalQuantity: 1, scenes: [1, 2] },
    ];
    const groups = breakdownPdfGroups(rows);
    const props = groups.find((g) => g.header.startsWith("Oggetti"));
    const cast = groups.find((g) => g.header.startsWith("Cast"));
    expect(props?.header).toBe("Oggetti (2)");
    expect(props?.elements).toHaveLength(2);
    expect(cast?.header).toBe("Cast (1)");
    expect(cast?.elements[0]).toContain("-> scene 1, 2");
  });

  // Regression: the PDF renders this line with PDFKit's "Courier" font, a
  // non-embedded Standard-14 font mapped to WinAnsiEncoding. "→" (U+2192) has
  // no glyph there and came out as garbled characters in the actual PDF —
  // "•" and "×" are fine (both exist in WinAnsiEncoding), only the arrow
  // isn't. Assert plain ASCII so this can't silently regress.
  it("never emits a non-WinAnsiEncoding arrow character (PDFKit Courier glyph gap)", () => {
    const rows: PdfRow[] = [
      { category: "props", name: "Pistola", totalQuantity: 1, scenes: [1] },
    ];
    const [group] = breakdownPdfGroups(rows);
    expect(group!.elements[0]).not.toContain("→");
    expect(group!.elements[0]).toContain("->");
  });
});

describe("breakdownPdfDocument (Spec 89 — AI disclosure stamp)", () => {
  const rows: PdfRow[] = [
    { category: "props", name: "Pistola", totalQuantity: 1, scenes: [1] },
  ];

  it("has no note line when aiDisclosureNote is omitted", () => {
    const doc = breakdownPdfDocument("Il Mio Film", rows);
    expect(doc.noteLine).toBeNull();
  });

  it("carries the note line verbatim when provided", () => {
    const doc = breakdownPdfDocument(
      "Il Mio Film",
      rows,
      "✦ Contiene elementi suggeriti da Cesare (AI)",
    );
    expect(doc.noteLine).toBe("✦ Contiene elementi suggeriti da Cesare (AI)");
  });

  it("still groups elements the same way regardless of the note", () => {
    const doc = breakdownPdfDocument("Il Mio Film", rows, "nota");
    expect(doc.groups).toEqual(breakdownPdfGroups(rows));
  });
});
