/**
 * Structured scene-heading data + helpers.
 *
 * A scene heading is two free-text slots — `prefix` (INT., EXT., EST., …)
 * and `title` (RISTORANTE - NOTTE, …) — both owned by the writer. No enum,
 * no canonical list: whatever the writer types becomes part of the project's
 * vocabulary, offered back as suggestions via the pickers.
 *
 * Pure functions only — safe to import from any runtime.
 */

export interface SceneHeadingSlots {
  readonly prefix: string;
  readonly title: string;
}

// First whitespace-delimited token ending in `.` or `/` is the prefix.
// Matches `INT.`, `EXT.`, `INT/EXT.`, `EST.`, `I/E.`.
// A line without this shape (e.g. `EST FOO` without a dot) is kept as
// a title with empty prefix — writer keeps what they typed.
const SPLIT_RE = /^(\S+[./])\s+(.+)$/;

/**
 * Split a legacy monolithic heading string into its two structured parts.
 *
 * Conservative: if the line doesn't match the heuristic, the entire string
 * becomes the title and the prefix is empty. The writer can always edit.
 */
export const splitLegacyHeading = (raw: string): SceneHeadingSlots => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { prefix: "", title: "" };
  const m = SPLIT_RE.exec(trimmed);
  if (m) return { prefix: m[1]!, title: m[2]! };
  return { prefix: "", title: trimmed };
};

/**
 * Join prefix + title back into a single Fountain-compatible heading line.
 *
 * No punctuation is forced — whatever the writer typed round-trips verbatim.
 */
export const joinHeading = (slots: SceneHeadingSlots): string => {
  if (slots.prefix.length === 0) return slots.title;
  if (slots.title.length === 0) return slots.prefix;
  return `${slots.prefix} ${slots.title}`;
};

/**
 * Deduplicate + sort by frequency (descending), tie-break alphabetical.
 * Used to rank picker suggestions so the writer's most-used prefix/title
 * appears first.
 */
export const rankByFrequency = (values: readonly string[]): string[] => {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v.length === 0) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .map(([v]) => v);
};

// Strip non-alphanumerics so `INT.` matches `INT/EXT.` — the writer
// thinks in letters, not punctuation. `I/E` vs `INT.` still won't cross
// because `IE` is not a prefix of `INT`.
const letters = (s: string): string =>
  s.replace(/[^A-Z0-9]/gi, "").toUpperCase();

/**
 * Migrate a legacy pm_doc JSON tree. A legacy heading has a single
 * `text*` child; a current heading has `prefix` + `title`. Idempotent:
 * already-migrated headings are returned unchanged.
 *
 * Pure — no PM schema dependency, runs anywhere the JSON can reach
 * (server at read-time, client before nodeFromJSON).
 */
interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  [k: string]: unknown;
}

export const migratePmDoc = <T>(doc: T): T => {
  return migrateNode(doc as unknown as PmNode) as unknown as T;
};

const migrateNode = (node: PmNode): PmNode => {
  if (!node || typeof node !== "object") return node;

  if (node.type === "heading") {
    const children = node.content ?? [];
    const alreadyMigrated =
      children.length === 2 &&
      children[0]?.type === "prefix" &&
      children[1]?.type === "title";
    if (alreadyMigrated) return node;

    const raw = (children[0]?.text as string | undefined) ?? "";
    const { prefix, title } = splitLegacyHeading(raw);
    return {
      ...node,
      content: [
        {
          type: "prefix",
          content: prefix ? [{ type: "text", text: prefix }] : [],
        },
        {
          type: "title",
          content: title ? [{ type: "text", text: title }] : [],
        },
      ],
    };
  }

  if (!node.content) return node;
  return { ...node, content: node.content.map(migrateNode) };
};

/**
 * Filter suggestions by what the writer has typed. Case-insensitive
 * prefix match on letters only (punctuation ignored). An exact match
 * is hidden (no point suggesting what's already typed).
 */
export const filterSuggestions = (
  suggestions: readonly string[],
  typed: string,
): string[] => {
  const t = letters(typed.trim());
  if (t.length === 0) return [...suggestions];
  return suggestions.filter((s) => {
    const u = s.toUpperCase();
    return letters(s).startsWith(t) && u !== typed.trim().toUpperCase();
  });
};
