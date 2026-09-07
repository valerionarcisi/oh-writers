import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";
import { toCsv } from "@oh-writers/utils";

export interface ExportRow {
  category: BreakdownCategory;
  name: string;
  description: string | null;
  totalQuantity: number;
  scenes: number[];
}

export const breakdownToCsv = (
  rows: ExportRow[],
  aiDisclosureNote?: string,
): string => {
  const header = ["Categoria", "Nome", "Descrizione", "Totale", "Scene"];
  const lines = rows.map((r) => [
    CATEGORY_META[r.category].labelIt,
    r.name,
    r.description ?? "",
    String(r.totalQuantity),
    r.scenes.join(", "),
  ]);
  const csv = toCsv(header, lines);
  // Spec 89 — AI disclosure stamp: a plain leading line, not a CSV row (it
  // has no columns to align with), so it's prepended outside toCsv.
  return aiDisclosureNote ? `${aiDisclosureNote}\n${csv}` : csv;
};
