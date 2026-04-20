import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";

export interface ExportRow {
  category: BreakdownCategory;
  name: string;
  description: string | null;
  totalQuantity: number;
  scenes: number[];
}

const escapeCsv = (s: string): string =>
  /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

export const breakdownToCsv = (rows: ExportRow[]): string => {
  const header = ["Category", "Name", "Description", "Total", "Scenes"].join(
    ",",
  );
  const lines = rows.map((r) =>
    [
      escapeCsv(CATEGORY_META[r.category].labelEn),
      escapeCsv(r.name),
      escapeCsv(r.description ?? ""),
      String(r.totalQuantity),
      escapeCsv(r.scenes.join(", ")),
    ].join(","),
  );
  return [header, ...lines].join("\n");
};
