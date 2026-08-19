import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";
import { toCsv } from "@oh-writers/utils";

export interface ExportRow {
  category: BreakdownCategory;
  name: string;
  description: string | null;
  totalQuantity: number;
  scenes: number[];
}

export const breakdownToCsv = (rows: ExportRow[]): string => {
  const header = ["Categoria", "Nome", "Descrizione", "Totale", "Scene"];
  const lines = rows.map((r) => [
    CATEGORY_META[r.category].labelIt,
    r.name,
    r.description ?? "",
    String(r.totalQuantity),
    r.scenes.join(", "),
  ]);
  return toCsv(header, lines);
};
