import { describe, it, expect } from "vitest";
import { breakdownToCsv, type ExportRow } from "./export-csv";

describe("breakdownToCsv (Spec 89 — AI disclosure stamp)", () => {
  const rows: ExportRow[] = [
    {
      category: "props",
      name: "Pistola",
      description: null,
      totalQuantity: 1,
      scenes: [1],
    },
  ];

  it("has no leading note row when aiDisclosureNote is omitted", () => {
    const csv = breakdownToCsv(rows);
    expect(csv.split("\n")[0]).toBe("Categoria,Nome,Descrizione,Totale,Scene");
  });

  it("prepends the note as its own row when provided", () => {
    const csv = breakdownToCsv(
      rows,
      "Contiene elementi suggeriti da Cesare (AI)",
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Contiene elementi suggeriti da Cesare (AI)");
    expect(lines[1]).toBe("Categoria,Nome,Descrizione,Totale,Scene");
  });
});
