// Coordinate-aware Fountain conversion.
//
// Screenplays encode element type by horizontal indentation. When the PDF
// importer can recover per-line X coordinates (see pdf-coords.server.ts), this
// module classifies each line by the X *bucket* it falls into rather than by
// guessing from its text. The buckets are derived adaptively per document —
// every screenplay PDF uses a different left margin, so the thresholds are
// clustered from the observed X values, not hardcoded.
//
// Two real layouts are covered:
//   - Flush-left scenes (e.g. "Non fa ridere"): the scene heading sits at the
//     body's left margin, action one indent in, then the dialogue block.
//   - Scene-number gutters (shooting scripts, e.g. "The Wolf of Wall Street"):
//     a narrow left gutter carries the scene number fused to the heading
//     ("1INSERT - TV COMMERCIAL - DAY 1"), separated from the action margin by
//     a wide blank. The gutter is the scene level; action sits to its right.
// Both reduce to the same model once the scene level (always the leftmost
// level whose lines begin with a fused scene number) is peeled off the body.
//
// Output is the same Fountain dialect the text-only path emits
// (fountain-from-pdf.ts): scene headings at column 0 with optional `#N#` forced
// scene numbers, CHARACTER cues at CHARACTER_INDENT, dialogue + parentheticals
// at DIALOGUE_INDENT. The downstream fountainToDoc consumes both identically.

import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";
import {
  isPageFurniture,
  stripDateAnnotationFromSlugline,
  SCENE_HEADING_RE,
} from "./fountain-from-pdf";

export interface CoordLine {
  x: number;
  text: string;
  pageStart: boolean;
}

type Role =
  | "scene"
  | "action"
  | "dialogue"
  | "parenthetical"
  | "character"
  | "drop";

// ─── X clustering ────────────────────────────────────────────────────────────
//
// Body lines fall into a handful of tight X levels (~30 user-space units apart
// on a typical Courier screenplay). Values within MERGE_GAP are the same level;
// a larger gap starts a new level.

const MERGE_GAP = 12;

interface Cluster {
  x: number; // representative (minimum) X of the cluster
  count: number;
  // Fraction of the cluster's lines that begin with a scene-number token
  // ("1INSERT…", "1A…", "3-3B…"). A scene / scene-number-gutter level is ~1.0;
  // every other body level is ~0.
  digitStartFraction: number;
}

// Opens with a scene-number token immediately followed by a non-digit (so the
// number is a gutter label, not a quantity inside prose). Matches "1INSERT",
// "1AWE SEE", "3-3BA SERIES", "12INT.".
const DIGIT_START_RE = /^\s*\d+[A-Z]?(?:-\d+[A-Z]?)?\D/;

const clusterXValues = (lines: readonly CoordLine[]): Cluster[] => {
  const sorted = [...lines].sort((a, b) => a.x - b.x);
  const clusters: { x: number; texts: string[] }[] = [];
  for (const line of sorted) {
    const last = clusters[clusters.length - 1];
    if (last !== undefined && line.x - last.x <= MERGE_GAP) {
      last.texts.push(line.text);
      continue;
    }
    clusters.push({ x: line.x, texts: [line.text] });
  }
  return clusters.map((c) => ({
    x: c.x,
    count: c.texts.length,
    digitStartFraction:
      c.texts.filter((t) => DIGIT_START_RE.test(t)).length / c.texts.length,
  }));
};

// A line whose text is only a page/scene number ("12.", "3", "42A") — the
// right-gutter noise pdf.js places at the page corners.
const NUMBER_ONLY_RE = /^\s*\d+[A-Z]?\.?\s*$/;

// Body lines, with the per-line noise that pollutes the X histogram removed by
// content: blank lines, bare page/scene numbers, and running headers / revision
// banners / distribution footers (the same furniture the text path strips).
const bodyLines = (lines: readonly CoordLine[]): CoordLine[] =>
  lines.filter(
    (l) =>
      l.text.trim() !== "" &&
      !NUMBER_ONLY_RE.test(l.text) &&
      !isPageFurniture(l.text),
  );

// A body indent column (action/dialogue/parenthetical/character) is real — vs.
// incidental scatter — only when it carries both an absolute minimum of lines
// and a real share of the body. The fraction keeps a sparse-but-real column (a
// parenthetical that appears a few dozen times on a long script) while dropping
// the handful of stray X values pdf.js emits at page corners and mid-line shot
// tags.
const MIN_LEVEL_COUNT = 4;
const MIN_LEVEL_FRACTION = 0.02;

const dominantBodyLevels = (
  clusters: readonly Cluster[],
  total: number,
): Cluster[] => {
  const minCount = Math.max(
    MIN_LEVEL_COUNT,
    Math.ceil(total * MIN_LEVEL_FRACTION),
  );
  return clusters.filter((c) => c.count >= minCount).sort((a, b) => a.x - b.x);
};

// A scene level is the leftmost level whose lines predominantly begin with a
// fused scene number — true both for a flush-left numbered slug
// ("1INT. CUCINA - NOTTE1") and for a shooting-script gutter ("1INSERT…1"). It
// is detected separately from the body-column filter because a script may have
// only a handful of scenes (well below any per-column share of body lines)
// while still carrying its scene number on every heading. A level qualifies
// only when it sits at or left of the body's action margin — a parenthetical
// that happens to open on a number must never be mistaken for a scene level.
const SCENE_DIGIT_FRACTION = 0.6;

const findSceneLevel = (
  clusters: readonly Cluster[],
  actionX: number,
): Cluster | null => {
  const scene = clusters
    .filter(
      (c) =>
        c.count >= 2 &&
        c.x < actionX &&
        c.digitStartFraction >= SCENE_DIGIT_FRACTION,
    )
    .sort((a, b) => a.x - b.x)[0];
  return scene ?? null;
};

// ─── Bucket model ──────────────────────────────────────────────────────────
//
// After dropping furniture and clustering, the dominant body levels are, in
// ascending X: [scene] action dialogue [parenthetical] character. The scene
// level (when present) is peeled off by its scene-number signature; the
// remaining levels map positionally — leftmost is action, rightmost is the
// character cue, the first after action is dialogue, and anything strictly
// between dialogue and character is the parenthetical column. This positional
// map tolerates a missing/sparse parenthetical (collapses to a dialogue/
// character split) without a hardcoded column count.

interface Buckets {
  // X at/below this is a scene heading. null when the document has no scene
  // level (then everything left of the dialogue group is action).
  sceneThreshold: number | null;
  // X at/below this (and above the scene level) is action.
  dialogueGroupStart: number;
  // X at/below this (within the dialogue group) is dialogue.
  parentheticalThreshold: number;
  // X at/below this is parenthetical; above is a character cue.
  characterThreshold: number;
}

const midpoint = (a: number, b: number): number => Math.round((a + b) / 2);

// A clean screenplay body shows at most action / dialogue / parenthetical /
// character (± an occasional dual-dialogue column). More distinct columns than
// this is scatter from mixed fonts or multi-column shot tags, not a layout the
// coordinate classifier can trust.
const MAX_BODY_LEVELS = 5;

// The action→dialogue jump (the page's dialogue indent) is a wide, deliberate
// step — on a real screenplay it spans a large fraction of the whole body X
// range. Evenly-spaced scatter has no such dominant step: every adjacent gap is
// a small, uniform slice of the range. Requiring the action→dialogue gap to
// clear this fraction of the body span rejects scatter while accepting both the
// flush-left (Non fa ridere) and gutter (Wolf) layouts, whose dialogue indent
// is ~40-50% of the span.
const MIN_DIALOGUE_INDENT_SPAN_FRACTION = 0.25;

// Derive adaptive X buckets, or null when the levels don't present a separable
// screenplay layout (so the caller falls back to the text-only path). The gate
// is intentionally narrow: a real screenplay must show a scene/action margin
// AND a dialogue block split into at least a dialogue column and a character
// cue column. A flat single-column extraction (no separable dialogue/character)
// fails here and defers to the text heuristic.
const deriveBuckets = (lines: readonly CoordLine[]): Buckets | null => {
  const body = bodyLines(lines);
  if (body.length < 4) return null;

  const clusters = clusterXValues(body);
  const dominant = dominantBodyLevels(clusters, body.length);
  if (dominant.length < 2) return null;

  // Peel a scene-number gutter that is itself dominant (a shooting script's
  // left gutter carries a scene number on hundreds of lines). When the leftmost
  // dominant level is scene-shaped it is the scene level; otherwise the scene
  // level — if any — is a sparse flush-left column found below, and the leftmost
  // dominant level is the action margin.
  const gutterIsDominant =
    dominant[0]!.digitStartFraction >= SCENE_DIGIT_FRACTION;
  const dominantScene = gutterIsDominant ? dominant[0]! : null;
  const bodyLevels = gutterIsDominant ? dominant.slice(1) : dominant;

  // Need an action margin plus a dialogue block that splits into at least a
  // dialogue column and a character-cue column. One body level (No Country's
  // single flush-left column) has no separable structure → reject. More than a
  // few columns is scatter, not a clean screenplay (action/dialogue/
  // parenthetical/character ± a dual-dialogue column) — defer to the text path.
  if (bodyLevels.length < 3 || bodyLevels.length > MAX_BODY_LEVELS) return null;

  const actionX = bodyLevels[0]!.x;
  const dialogueX = bodyLevels[1]!.x;
  const characterX = bodyLevels[bodyLevels.length - 1]!.x;

  // The action→dialogue jump must be a real dialogue indent — a wide step, not
  // one of many uniform slices. Reject evenly-spaced scatter, where no gap
  // dominates the body's X span.
  const bodySpan = characterX - actionX;
  if (dialogueX - actionX < bodySpan * MIN_DIALOGUE_INDENT_SPAN_FRACTION) {
    return null;
  }
  // Parenthetical sits strictly between dialogue and character; absent when the
  // right group has only dialogue + character (then split their span in half).
  const parentheticalX =
    bodyLevels.length >= 4
      ? bodyLevels[bodyLevels.length - 2]!.x
      : midpoint(dialogueX, characterX);

  // The scene level is the dominant gutter when present, else a sparse
  // flush-left numbered column sitting at or left of the action margin.
  const sceneLevel = dominantScene ?? findSceneLevel(clusters, actionX);

  return {
    sceneThreshold:
      sceneLevel !== null ? midpoint(sceneLevel.x, actionX) : null,
    dialogueGroupStart: midpoint(actionX, dialogueX),
    parentheticalThreshold: midpoint(dialogueX, parentheticalX),
    characterThreshold: midpoint(parentheticalX, characterX),
  };
};

// ─── Classification ──────────────────────────────────────────────────────────

interface Block {
  role: Role;
  text: string;
  number: string | null;
}

const PARENTHETICAL_OPEN_RE = /^\s*\(/; // line opens a parenthetical
const isAllUppercase = (text: string): boolean =>
  /[A-ZÀ-Ý]/.test(text) && text === text.toUpperCase();

// A parenthetical wraps across visual lines: "(mimando la voce di una" then
// "signore)". The continuation line opens no "(" but sits at the parenthetical
// indent, so it must be folded back into the open parenthetical rather than
// mis-tagged as dialogue. We track whether the previous block is a parenthetical
// still missing its closing ")".
const isUnclosedParenthetical = (block: Block | undefined): boolean => {
  if (block === undefined || block.role !== "parenthetical") return false;
  const opens = (block.text.match(/\(/g) ?? []).length;
  const closes = (block.text.match(/\)/g) ?? []).length;
  return opens > closes;
};

const roleForLine = (
  line: CoordLine,
  buckets: Buckets,
  prev: Block | undefined,
): Role => {
  const trimmed = line.text.trim();
  if (trimmed === "") return "drop";
  // Right-gutter page/scene numbers carry no body text.
  if (NUMBER_ONLY_RE.test(trimmed)) return "drop";
  // Running headers / revision banners / footers that survived bucketing.
  if (isPageFurniture(line.text)) return "drop";

  // A slugline (INT./EXT./…) is a scene heading by SHAPE, regardless of indent.
  // Flush-left shooting scripts put the heading at the SAME margin as action
  // (no separate scene gutter), so the X-bucket test below can't tell them
  // apart — without this, headings get absorbed into the surrounding action
  // paragraph. The pattern check is authoritative for the heading line.
  if (SCENE_HEADING_RE.test(trimmed)) return "scene";

  const { x } = line;
  // Scene level (flush-left margin or scene-number gutter).
  if (buckets.sceneThreshold !== null && x <= buckets.sceneThreshold) {
    return "scene";
  }
  // Left group → action (everything between the scene level and the dialogue
  // group is action prose).
  if (x < buckets.dialogueGroupStart) return "action";
  // Right (dialogue) group → dialogue / parenthetical / character by indent,
  // confirmed by text shape so a wrapped continuation at a slightly off X (or a
  // parenthetical whose own indent matches dialogue) lands correctly.
  if (PARENTHETICAL_OPEN_RE.test(trimmed)) return "parenthetical";
  // Continuation of a wrapped parenthetical: same indent, previous still open.
  if (isUnclosedParenthetical(prev) && x > buckets.parentheticalThreshold) {
    return "parenthetical";
  }
  if (x > buckets.characterThreshold && isAllUppercase(trimmed)) {
    return "character";
  }
  if (x <= buckets.parentheticalThreshold) return "dialogue";
  // Between dialogue and character indents and not a parenthetical: an
  // ALL-CAPS line here is a cue, otherwise treat as dialogue.
  return isAllUppercase(trimmed) ? "character" : "dialogue";
};

// ─── Scene-number unfusing ───────────────────────────────────────────────────
//
// pdf.js places the gutter scene number at the same Y as the heading, so a
// heading line arrives with the number fused at the left and (usually) echoed
// at the right: "1INT. CUCINA - NOTTE1", "1AWE SEE … BULL.1A". We capture the
// number and strip both copies, mirroring the `#N#` forced-number syntax the
// text-only path emits. A trailing revision asterisk and an inline date stamp
// ("(FEB '95)") are shooting-script noise stripped at the same time.

// Scene-number token, optionally a range: "1", "42A", "1C-1D", "3-3B".
const SCENE_NUMBER = /\d+[A-Z]?(?:-\d+[A-Z]?)?/;
const LEADING_TRAILING_NUMBER_RE = new RegExp(
  `^(${SCENE_NUMBER.source})(.*?)\\1\\*?$`,
);
const LEADING_NUMBER_RE = new RegExp(`^(${SCENE_NUMBER.source})(\\D.*)$`);

const unfuseHeading = (
  raw: string,
): { heading: string; number: string | null } => {
  const text = raw.replace(/\*+\s*$/, "").trim();
  // Number fused at both ends ("1AWE SEE … BULL.1A").
  const both = text.match(LEADING_TRAILING_NUMBER_RE);
  if (both && both[2]!.trim() !== "") {
    return {
      heading: stripDateAnnotationFromSlugline(both[2]!.trim()).trim(),
      number: both[1]!,
    };
  }
  // Number fused only at the left ("3-3BA SERIES OF POLAROIDS").
  const lead = text.match(LEADING_NUMBER_RE);
  if (lead && lead[2]!.trim() !== "") {
    return {
      heading: stripDateAnnotationFromSlugline(lead[2]!.trim()).trim(),
      number: lead[1]!,
    };
  }
  return {
    heading: stripDateAnnotationFromSlugline(text).trim(),
    number: null,
  };
};

// ─── Paragraph join ──────────────────────────────────────────────────────────
//
// With X known, paragraph boundaries are exact: consecutive lines of the same
// role at the same X bucket and with no page break between them are one logical
// paragraph that the PDF wrapped at the column width. A role change, a page
// break, or a closed parenthetical ends the paragraph. A wrapped parenthetical
// ("(mimando la voce di una" / "signore)") joins until its ")" arrives.

const HYPHEN_TAIL_RE = /[A-Za-zÀ-ÿ]-$/;

// Roles whose consecutive same-bucket lines are wrap continuations of one
// logical paragraph. Parentheticals join via the open-paren state instead,
// since the close ")" ends the run while the role stays the same.
const PARAGRAPH_ROLES: ReadonlySet<Role> = new Set(["action", "dialogue"]);

const joinParagraphs = (
  lines: readonly CoordLine[],
  buckets: Buckets,
): Block[] => {
  const out: Block[] = [];
  // A blank line between two content lines is a PARAGRAPH BREAK, not a wrap.
  // Consecutive same-role lines only join when NO blank separated them (a true
  // column-width wrap). Without this, flush-left scripts — where every action
  // beat sits at the same X and is separated only by a blank — collapse into one
  // giant run-on paragraph (and dialogue runs into the following action).
  let blankBefore = false;
  for (const line of lines) {
    const prev = out[out.length - 1];
    const role = roleForLine(line, buckets, prev);
    if (role === "drop") {
      // Only a genuinely empty line marks a paragraph boundary; dropped
      // furniture (page numbers, headers) does not glue paragraphs together
      // either, so treat any drop as a separator.
      blankBefore = true;
      continue;
    }

    if (role === "scene") {
      const { heading, number } = unfuseHeading(line.text.trim());
      if (heading === "") continue;
      out.push({ role, text: heading, number });
      blankBefore = false;
      continue;
    }

    const trimmed = line.text.trim();
    const continuesParenthetical =
      prev !== undefined &&
      role === "parenthetical" &&
      isUnclosedParenthetical(prev) &&
      !PARENTHETICAL_OPEN_RE.test(trimmed) &&
      !line.pageStart;
    const canJoin =
      continuesParenthetical ||
      (prev !== undefined &&
        prev.role === role &&
        PARAGRAPH_ROLES.has(role) &&
        !line.pageStart &&
        !blankBefore);

    // A content line consumes the pending paragraph-break flag either way.
    blankBefore = false;

    if (!canJoin) {
      out.push({ role, text: trimmed, number: null });
      continue;
    }

    // The PDF wrapped this line from the previous one. Rejoin: keep a
    // hyphenated compound intact, otherwise insert a single space.
    prev.text =
      HYPHEN_TAIL_RE.test(prev.text) && /^[a-zà-ÿ]/.test(trimmed)
        ? prev.text + trimmed
        : `${prev.text} ${trimmed}`;
  }
  return out;
};

// ─── Render ──────────────────────────────────────────────────────────────────

const renderBlock = ({ role, text, number }: Block): string => {
  switch (role) {
    case "scene": {
      const upper = text.toUpperCase();
      return number !== null ? `${upper} #${number}#` : upper;
    }
    case "action":
      return text;
    case "character":
      return CHARACTER_INDENT + text;
    case "parenthetical":
    case "dialogue":
      return DIALOGUE_INDENT + text;
    case "drop":
      return "";
  }
};

export interface CoordFountainOptions {
  // When the caller has already detected a title page (Pass 0), the leading
  // cover-page lines that precede the first scene heading are not body content
  // and must be dropped — they'd otherwise classify as stray action/character.
  // Mirrors the body-starts-at-first-slugline convention of the text path.
  dropTitlePagePrefix?: boolean;
}

// Drop every block before the first scene heading. Used only when a title page
// was detected, so a screenplay that legitimately opens on action (no title
// page) keeps that action.
const dropBeforeFirstScene = (blocks: readonly Block[]): Block[] => {
  const firstScene = blocks.findIndex((b) => b.role === "scene");
  return firstScene === -1 ? [...blocks] : blocks.slice(firstScene);
};

/**
 * Convert coordinate-tagged PDF lines into Oh Writers Fountain. Returns null
 * when the lines don't present a recognisable screenplay layout (no usable X
 * buckets), so the caller can fall back to the text-only `fountainFromPdf`.
 *
 * Steps:
 *   1. Derive adaptive X buckets from the document's own clusters (scene level
 *      peeled by its scene-number signature, remaining levels mapped
 *      positionally to action/dialogue/parenthetical/character).
 *   2. Classify each line by bucket (confirmed by text shape at the margins).
 *   3. Join wrapped continuation lines into logical paragraphs (exact, since
 *      the X bucket and page breaks mark the boundaries).
 *   4. Render with the Oh Writers indent convention.
 */
export const fountainFromPdfCoords = (
  lines: readonly CoordLine[],
  options: CoordFountainOptions = {},
): string | null => {
  const buckets = deriveBuckets(lines);
  if (buckets === null) return null;

  const joined = joinParagraphs(lines, buckets);
  const blocks = options.dropTitlePagePrefix
    ? dropBeforeFirstScene(joined)
    : joined;

  // Canonical Fountain spacing: a blank line between blocks, EXCEPT inside a
  // dialogue group (character → parentheticals/dialogue stay glued). Without
  // the blank, `fountainToDoc` treats a flush-left action that directly
  // follows dialogue as a continuation of the speech — the imported "Filippo
  // entra nel locale…" beats rendered as dialogue. Dialogue that resumes
  // after an interleaved action keeps its DIALOGUE_INDENT, which the editor
  // detects by indentation, so the blank never breaks a resumed speech.
  const rendered: string[] = [];
  let prevRole: Block["role"] | null = null;
  for (const block of blocks) {
    const line = renderBlock(block);
    if (line === "") continue;
    const gluedToDialogueGroup =
      (block.role === "parenthetical" || block.role === "dialogue") &&
      (prevRole === "character" ||
        prevRole === "parenthetical" ||
        prevRole === "dialogue");
    if (prevRole !== null && !gluedToDialogueGroup) rendered.push("");
    rendered.push(line);
    prevRole = block.role;
  }
  if (rendered.length === 0) return null;
  return rendered.join("\n");
};
