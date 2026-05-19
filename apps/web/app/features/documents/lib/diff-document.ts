export type DocumentDiffLine =
  | { readonly type: "equal"; readonly text: string }
  | { readonly type: "insert"; readonly text: string }
  | { readonly type: "delete"; readonly text: string };

/**
 * Computes a minimal line-level diff between two document strings using LCS.
 * Output is the canonical (delete, insert, equal) line list — same shape as
 * `diffScreenplays` from features/screenplay-editor but without the
 * diff-match-patch dependency, which is overkill for the document banner.
 *
 * Complexity O(n*m) on the two line counts. Documents we deal with here are
 * at most a few thousand lines, so this is well within budget.
 */
export const diffDocumentLines = (
  oldText: string,
  newText: string,
): DocumentDiffLine[] => {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  // Backtrack
  const result: DocumentDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "equal", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: "delete", text: a[i]! });
      i++;
    } else {
      result.push({ type: "insert", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "delete", text: a[i]! });
    i++;
  }
  while (j < m) {
    result.push({ type: "insert", text: b[j]! });
    j++;
  }
  return result;
};
