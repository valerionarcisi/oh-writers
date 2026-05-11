export type PageCountColor = "green" | "yellow" | "red";

export const pageCountColor = (pages: number): PageCountColor => {
  if (pages < 4 || pages > 12) return "red";
  if (pages < 6 || pages > 9) return "yellow";
  return "green";
};

export const TARGET_PAGES_PER_DAY = 8;
