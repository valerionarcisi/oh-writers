/**
 * Scene numbering with letter suffixes.
 *
 * Industry convention: once a script is locked, inserting a scene between
 * `4` and `5` produces `4A`. Inserting again produces `4B`. Letters always
 * belong to the scene they follow.
 *
 * Pure functions only — safe to import from any runtime (web, mobile, tests).
 */

export const INT_EXT_OPTIONS = [
  { prefix: "INT.", label: "INT." },
  { prefix: "EXT.", label: "EXT." },
  { prefix: "INT/EXT.", label: "INT/EXT." },
  { prefix: "EXT/INT.", label: "EXT/INT." },
] as const;

export type IntExtPrefix = (typeof INT_EXT_OPTIONS)[number]["prefix"];

/**
 * Filter INT/EXT options by the characters the user has typed.
 * Case-insensitive, prefix match only.
 */
export const filterIntExt = (typed: string): readonly IntExtPrefix[] => {
  const t = typed.trim().toUpperCase();
  if (t.length === 0) return INT_EXT_OPTIONS.map((o) => o.prefix);
  return INT_EXT_OPTIONS.filter((o) => o.prefix.startsWith(t)).map(
    (o) => o.prefix,
  );
};

export interface SceneNumber {
  readonly number: number;
  readonly letters: string;
}

const SCENE_NUMBER_RE = /^(\d+)([A-Z]*)$/;

/**
 * Parse a raw scene-number string into its numeric + letter parts.
 * Returns null for anything that doesn't match `\d+[A-Z]*`.
 */
export const parseSceneNumber = (raw: string): SceneNumber | null => {
  const m = raw.trim().toUpperCase().match(SCENE_NUMBER_RE);
  if (!m) return null;
  return { number: parseInt(m[1]!, 10), letters: m[2] ?? "" };
};

/**
 * Increment a letter suffix: `""` → `"A"`, `"A"` → `"B"`, `"Z"` → `"AA"`,
 * `"AA"` → `"AB"`.
 *
 * Modelled as a base-26 counter where digits are A–Z and "no letter" is the
 * implicit zero. Used to produce the next free suffix when the user inserts
 * multiple scenes after the same anchor.
 */
export const nextLetterSuffix = (suffix: string): string => {
  if (suffix.length === 0) return "A";
  const chars = suffix.toUpperCase().split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i]! < "Z") {
      chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
      return chars.join("");
    }
    chars[i] = "A";
    i--;
  }
  return "A" + chars.join("");
};

/**
 * Compare two scene-number strings numerically + lexicographically on letters.
 * Returns negative if `a < b`, positive if `a > b`, zero if equal.
 * Invalid inputs sort to the end.
 */
export const compareSceneNumbers = (a: string, b: string): number => {
  const pa = parseSceneNumber(a);
  const pb = parseSceneNumber(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.number !== pb.number) return pa.number - pb.number;
  if (pa.letters === pb.letters) return 0;
  if (pa.letters.length !== pb.letters.length)
    return pa.letters.length - pb.letters.length;
  return pa.letters < pb.letters ? -1 : 1;
};

/**
 * Assign a scene number to a scene inserted at position `insertAt`
 * within an existing array of scene numbers.
 *
 * Rules:
 * - At the end (`insertAt === existing.length`) with no gap → next integer
 *   after the last scene's number (letters dropped).
 * - In the middle, between scene `prev` and scene `next`:
 *   - The new scene "belongs" to `prev` — it gets the next free letter suffix
 *     of `prev`'s number, skipping any suffixes already used by siblings.
 *
 * Example: existing `["1", "2", "3"]`, insertAt=1 → `"1A"` (between 1 and 2).
 * Example: existing `["1", "1A", "2"]`, insertAt=2 → `"1B"` (after 1A, before 2).
 */
export const sceneNumberForInsertion = (
  existing: readonly string[],
  insertAt: number,
): string => {
  if (existing.length === 0) return "1";

  if (insertAt >= existing.length) {
    const last = parseSceneNumber(existing[existing.length - 1]!);
    if (!last) return String(existing.length + 1);
    return String(last.number + 1);
  }

  if (insertAt === 0) {
    const first = parseSceneNumber(existing[0]!);
    if (!first || first.number <= 1) return "0A";
    return String(first.number - 1);
  }

  const prev = parseSceneNumber(existing[insertAt - 1]!);
  if (!prev) return String(insertAt + 1);

  // Collect every suffix already in use for prev.number so we skip past them.
  const usedSuffixes = existing
    .map(parseSceneNumber)
    .filter((p): p is SceneNumber => p !== null && p.number === prev.number)
    .map((p) => p.letters);
  let candidate = nextLetterSuffix(prev.letters);
  while (usedSuffixes.includes(candidate)) {
    candidate = nextLetterSuffix(candidate);
  }
  return `${prev.number}${candidate}`;
};

/**
 * Generate fresh sequential numbers 1..count — no letter suffixes.
 * Used by the "Renumber" toolbar action.
 */
export const renumberAll = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, i) => String(i + 1));
