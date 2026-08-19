// Shared CSV serialization (Spec 85 #3). The per-feature copies of this
// escaped/joined differently (`\n`-only vs `\n\r`) and drifted on quoting edge
// cases; this is the single home. Features keep their row-shaping and pass
// string cells here.

export const escapeCsv = (s: string): string =>
  /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

export const toCsv = (
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string =>
  [header, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
