// packages/domain/src/cesare-history/context-summary.ts
// Spec 51 (step 4) — BOUNDED history summary for the prompt context. PURE.
//
// Reuses the same DERIVED sources as the changelog/transcript, but renders a
// compact, capped block so a follow-up session carries forward "what we changed
// last time" WITHOUT bloating the prompt. Older history is summarised; only the
// last N edits are listed in detail. No raw HTML; regenerable from source.
import type { EditChangelogSource } from "./types.js";

export interface HistorySummaryOptions {
  /** Max edits listed in detail (most recent kept). Older folded into a count. */
  readonly maxEdits: number;
}

const DEFAULT_OPTIONS: HistorySummaryOptions = { maxEdits: 8 };

const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

const editLine = (edit: EditChangelogSource): string => {
  let added = 0;
  let removed = 0;
  for (const seg of edit.diffSegments) {
    if (seg.op === "add") added += countWords(seg.text);
    else if (seg.op === "del") removed += countWords(seg.text);
  }
  const versionPart =
    edit.versionNumber !== null ? ` (v${edit.versionNumber})` : "";
  return `- ${edit.entityLabel}${versionPart}: +${added}/−${removed} parole`;
};

/**
 * Render a BOUNDED markdown summary of the edits made in prior sessions, for
 * reuse as model context. Most-recent `maxEdits` listed in detail; the rest
 * folded into a trailing count so the block stays small. Empty edits → null
 * (the caller omits the section entirely rather than emitting noise).
 */
export const buildHistoryContextSummary = (
  edits: ReadonlyArray<EditChangelogSource>,
  options: HistorySummaryOptions = DEFAULT_OPTIONS,
): string | null => {
  if (edits.length === 0) return null;

  // Most recent last in the source order → take the tail for "recent".
  const recent = edits.slice(-options.maxEdits);
  const olderCount = edits.length - recent.length;

  const lines: string[] = ["## CRONOLOGIA MODIFICHE (sessioni precedenti)"];
  lines.push(
    "Modifiche già applicate da Cesare. Usale per dare continuità — non rifarle.",
  );
  for (const edit of recent) lines.push(editLine(edit));
  if (olderCount > 0) {
    lines.push(`- …e altre ${olderCount} modifiche precedenti.`);
  }
  return lines.join("\n");
};
