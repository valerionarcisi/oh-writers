// Industry standard: 1 screenplay page ≈ 55 lines ≈ 1 minute of screen time.

export const estimatePageCount = (content: string): number =>
  Math.max(0, Math.ceil(content.split("\n").length / 55));

export const currentPageFromLine = (lineNumber: number): number =>
  Math.max(1, Math.ceil(lineNumber / 55));

export const formatPageCount = (pages: number): string =>
  pages === 0
    ? "0 pages"
    : `${pages} page${pages !== 1 ? "s" : ""} / ~${pages} min`;
