// packages/domain/src/cesare-history/changelog.ts
// Spec 51 (step 2) — per-edit changelog markdown. PURE, framework-agnostic.
//
// DERIVED VIEW: given the version-id pair + the word-level diff segments (which
// the loader reads from `document_versions` + the diff markers), render a
// readable markdown record of ONE agentic edit. No raw HTML — additions render
// bold (`**…**`), removals strikethrough (`~~…~~`), unchanged words plain. The
// markdown is regenerable: same source data → byte-identical output.
import type { EditChangelogSource, HistoryDiffSegment } from "./types.js";

// Render one segment, keeping its original surrounding whitespace OUTSIDE the
// markdown decoration (so `**word**` never swallows the space that separates it
// from the next word, and the prose stays readable). Equal segments pass through
// verbatim; added/removed words are decorated, whitespace-only runs untouched.
const renderSegment = (seg: HistoryDiffSegment): string => {
  if (seg.op === "eq" || seg.text.trim() === "") return seg.text;
  const leading = seg.text.match(/^\s*/)?.[0] ?? "";
  const trailing = seg.text.match(/\s*$/)?.[0] ?? "";
  const core = seg.text.trim();
  const decorated = seg.op === "add" ? `**${core}**` : `~~${core}~~`;
  return `${leading}${decorated}${trailing}`;
};

// Render the diff as a single inline markdown stream, then collapse internal
// whitespace runs so the result is compact and deterministic.
const renderInlineDiff = (
  segments: ReadonlyArray<HistoryDiffSegment>,
): string => {
  if (segments.length === 0) return "_(nessuna differenza testuale)_";
  return segments
    .map(renderSegment)
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

interface DiffCounts {
  readonly added: number;
  readonly removed: number;
}

const tallyCounts = (
  segments: ReadonlyArray<HistoryDiffSegment>,
): DiffCounts => {
  let added = 0;
  let removed = 0;
  for (const seg of segments) {
    if (seg.op === "add") added += countWords(seg.text);
    else if (seg.op === "del") removed += countWords(seg.text);
  }
  return { added, removed };
};

const versionLabel = (id: string, number: number | null): string =>
  number !== null ? `v${number} (\`${id}\`)` : `\`${id}\``;

/**
 * Render ONE per-edit changelog entry as markdown. Stable output for stable
 * input (the regenerability property the spec mandates).
 *
 * Shape:
 *   ### {EntityLabel}
 *   - Versione: {prev} → {new}
 *   - Modifiche: +N parole, −M parole
 *   - Quando: {iso}
 *
 *   {inline word diff}
 */
export const buildEditChangelogMarkdown = (
  source: EditChangelogSource,
  // Optional `###` heading text override. The transcript passes a token-bearing
  // heading so a `[label](#slug)` deep-link resolves against the auto-slug.
  headingText: string = source.entityLabel,
): string => {
  const counts = tallyCounts(source.diffSegments);
  const lines: string[] = [];

  lines.push(`### ${headingText}`);

  const fromLabel =
    source.previousVersionId !== null
      ? versionLabel(source.previousVersionId, source.previousVersionNumber)
      : "_(prima versione)_";
  const toLabel = versionLabel(source.versionId, source.versionNumber);
  lines.push(`- Versione: ${fromLabel} → ${toLabel}`);
  lines.push(`- Modifiche: +${counts.added} parole, −${counts.removed} parole`);
  if (source.createdAt !== null) {
    lines.push(`- Quando: ${source.createdAt}`);
  }

  lines.push("");
  lines.push(renderInlineDiff(source.diffSegments));

  return lines.join("\n");
};

/**
 * Render a list of edit entries as a single changelog markdown document.
 * Returns an explicit empty-state when there are no edits.
 */
export const buildEditChangelogListMarkdown = (
  entries: ReadonlyArray<EditChangelogSource>,
): string => {
  if (entries.length === 0) {
    return "## Modifiche\n\n_(nessuna modifica registrata)_";
  }
  return [
    "## Modifiche",
    "",
    ...entries.map((entry) => buildEditChangelogMarkdown(entry)),
  ].join("\n\n");
};
