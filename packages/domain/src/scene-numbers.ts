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

// ─── Resequence ──────────────────────────────────────────────────────────────

/**
 * Raised when `resequenceAll` cannot produce a valid numbering: usually because
 * two locked scenes are out of order (e.g. a later scene is locked to "3" but
 * an earlier scene is locked to "5"), or there is not enough numeric room to
 * fit the unlocked scenes between two locked bounds.
 *
 * Plain value object so it survives JSON serialization over a server fn
 * boundary (see `packages/utils/src/errors.ts`).
 */
export class ResequenceConflictError {
  readonly _tag = "ResequenceConflictError" as const;
  readonly message: string;
  constructor(readonly reason: string) {
    this.message = `Resequence conflict: ${reason}`;
  }
}

export interface ResequenceInput {
  readonly number: string;
  readonly locked: boolean;
}

export type ResequenceResult =
  | { readonly ok: true; readonly numbers: readonly string[] }
  | { readonly ok: false; readonly error: ResequenceConflictError };

const formatSceneNumber = (sn: SceneNumber): string =>
  `${sn.number}${sn.letters}`;

/**
 * Fill a gap of `count` scene numbers between `prev` (exclusive, or null for
 * "start of doc") and `next` (exclusive, or null for "end of doc").
 *
 * Strategy: prefer plain ascending integers starting from `prev.number + 1`.
 * If that would run into `next`, fall back to letter suffixes anchored on
 * `prev` (so inserting 3 scenes between `5-locked` and `6-locked` yields
 * `5A, 5B, 5C`). Throws a conflict error if no layout works.
 */
const fillGap = (
  prev: SceneNumber | null,
  next: SceneNumber | null,
  count: number,
): string[] => {
  if (count === 0) return [];

  const start = prev ? prev.number + 1 : 1;
  const fitsNumerically = next === null || start + count - 1 < next.number;
  if (fitsNumerically) {
    return Array.from({ length: count }, (_, i) => String(start + i));
  }

  // Letter-suffix fallback: anchor on prev (or on "0" if there is no prev).
  const anchorNum = prev ? prev.number : 0;
  let letters = prev ? prev.letters : "";
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    letters = nextLetterSuffix(letters);
    const candidate = `${anchorNum}${letters}`;
    if (
      next !== null &&
      compareSceneNumbers(candidate, formatSceneNumber(next)) >= 0
    ) {
      throw new ResequenceConflictError(
        `cannot fit ${count} scene(s) between ${prev ? formatSceneNumber(prev) : "start"} and ${formatSceneNumber(next)}`,
      );
    }
    result.push(candidate);
  }
  return result;
};

/**
 * Resequence an ordered list of scenes, keeping every `locked` scene's number
 * fixed and assigning fresh numbers to the unlocked ones.
 *
 * Guarantees:
 * - Output has the same length as input.
 * - Locked scenes keep their exact number string.
 * - Unlocked scenes get the smallest ascending numbers that respect both
 *   surrounding locked bounds.
 *
 * Fails (returns `{ ok: false, error }`) if:
 * - A locked scene number is unparseable.
 * - Two locked scenes are not strictly increasing in document order.
 * - There isn't enough numeric room between two locked bounds to fit the
 *   unlocked scenes in between.
 */
export const resequenceAll = (
  scenes: readonly ResequenceInput[],
): ResequenceResult => {
  const out: string[] = new Array(scenes.length).fill("");

  // Validate locked ordering and preload their numbers into the output.
  let lastLocked: SceneNumber | null = null;
  for (let i = 0; i < scenes.length; i++) {
    if (!scenes[i]!.locked) continue;
    const parsed = parseSceneNumber(scenes[i]!.number);
    if (!parsed) {
      return {
        ok: false,
        error: new ResequenceConflictError(
          `invalid locked number "${scenes[i]!.number}"`,
        ),
      };
    }
    if (
      lastLocked &&
      compareSceneNumbers(
        formatSceneNumber(lastLocked),
        formatSceneNumber(parsed),
      ) >= 0
    ) {
      return {
        ok: false,
        error: new ResequenceConflictError(
          `locked scenes out of order: ${formatSceneNumber(lastLocked)} before ${formatSceneNumber(parsed)}`,
        ),
      };
    }
    out[i] = formatSceneNumber(parsed);
    lastLocked = parsed;
  }

  // Walk the array, filling each run of unlocked scenes between locked bounds.
  let prev: SceneNumber | null = null;
  let runStart = 0;
  for (let i = 0; i <= scenes.length; i++) {
    const atBoundary = i === scenes.length || scenes[i]!.locked;
    if (!atBoundary) continue;

    const next =
      i === scenes.length ? null : parseSceneNumber(scenes[i]!.number);
    const count = i - runStart;
    if (count > 0) {
      try {
        const filled = fillGap(prev, next, count);
        for (let j = 0; j < count; j++) out[runStart + j] = filled[j]!;
      } catch (e) {
        if (e instanceof ResequenceConflictError)
          return { ok: false, error: e };
        throw e;
      }
    }
    if (i < scenes.length) prev = next;
    runStart = i + 1;
  }

  return { ok: true, numbers: out };
};
