import { Node } from "prosemirror-model";
import { schema } from "./schema";
import { detectElement } from "./fountain-element-detector";
import type { ElementType } from "./fountain-element-detector";
import {
  CHARACTER_INDENT,
  DIALOGUE_INDENT,
  SCENE_HEADING_RE,
} from "./fountain-constants";
import { splitLegacyHeading } from "@oh-writers/domain";

// Fountain forced-scene-number syntax: `#1A#`, `#42#`, `#3-3B#` at end of
// heading line. Used by fountain-from-pdf to round-trip shooting-script
// numbers into the heading attr.
const FORCED_SCENE_NUMBER_RE = /\s*#([^#\n]+)#\s*$/;

const extractForcedNumber = (
  raw: string,
): { line: string; number: string | null } => {
  const m = raw.match(FORCED_SCENE_NUMBER_RE);
  if (!m) return { line: raw, number: null };
  return { line: raw.slice(0, m.index).trimEnd(), number: m[1]!.trim() };
};

// Build a structured heading node with `prefix` and `title` child nodes.
// Any Fountain heading line is split by splitLegacyHeading — the writer's
// exact prefix/title round-trips verbatim.
const buildHeadingNode = (
  raw: string,
  scene_number: string,
  scene_number_locked: boolean = false,
): Node => {
  const { prefix, title } = splitLegacyHeading(raw);
  return schema.node("heading", { scene_number, scene_number_locked }, [
    schema.node("prefix", null, prefix ? [schema.text(prefix)] : []),
    schema.node("title", null, title ? [schema.text(title)] : []),
  ]);
};

/**
 * Convert a Fountain-formatted string into a ProseMirror document.
 *
 * Line classification re-uses detectElement so the PM editor and the Monaco
 * editor always agree on what a line means.
 *
 * The caller does not need to know about PM internals — this is a pure
 * function: same Fountain input → same doc output.
 */
export const fountainToDoc = (text: string): Node => {
  const lines = text.split("\n");
  const scenes: Node[] = [];
  let currentHeading: string | null = null;
  let currentBody: Node[] = [];

  const flushScene = (): void => {
    if (currentHeading === null) return;
    // Forced-scene-number syntax wins over sequential assignment. Presence of
    // `#...#` means the writer (or a shooting-script import) asserted the
    // number — we preserve it verbatim and lock it so Ricalcola doesn't wipe.
    const { line, number } = extractForcedNumber(currentHeading);
    const sceneNumber =
      number !== null && number.length > 0 ? number : String(scenes.length + 1);
    const locked = number !== null && number.length > 0;
    const headingNode = buildHeadingNode(line, sceneNumber, locked);
    scenes.push(schema.node("scene", null, [headingNode, ...currentBody]));
    currentHeading = null;
    currentBody = [];
  };

  // Top-level transitions (e.g. FADE OUT. at the very end, outside a scene)
  const topLevelTransitions: Node[] = [];

  // Context flag: true when the previous non-blank element was a character cue
  // or parenthetical inside a dialogue block. Used to classify unindented lines
  // as dialogue when imported from PDF (which strips all indentation).
  let inDialogueBlock = false;

  for (let i = 0; i < lines.length; i++) {
    // lines[i] is always defined inside bounds — TS noUncheckedIndexedAccess guard
    const line = lines[i] as string;
    const prev = i > 0 ? (lines[i - 1] as string) : null;

    // Blank lines normally end a dialogue block. EXCEPTION: AI-generated /
    // hand-typed Fountain often puts a blank line between a CHARACTER cue and
    // its speech (e.g. "MARCO (V.O.)" ⏎ "" ⏎ "      Luca, ascolta."). If we
    // closed the block on that blank, the indented speech below would be read
    // as a fresh character cue and render UPPERCASE (the "dialogue shows in
    // caps" bug). So when we're in a dialogue block and the NEXT non-blank line
    // is indented (cue/dialogue indent), keep the block open across the blank.
    if (line.trim() === "") {
      if (inDialogueBlock) {
        const nextNonBlank = lines.slice(i + 1).find((l) => l.trim() !== "");
        const nextIsIndentedSpeech =
          nextNonBlank !== undefined &&
          (nextNonBlank.startsWith(CHARACTER_INDENT) ||
            nextNonBlank.startsWith(DIALOGUE_INDENT));
        if (!nextIsIndentedSpeech) inDialogueBlock = false;
      }
      continue;
    }

    let type: ElementType = detectElement(line, prev);

    // Context-aware reclassification inside a dialogue block. After a character
    // cue (or a parenthetical that keeps the block open), the following lines
    // are the speech — even when they don't carry the 10-space DIALOGUE_INDENT.
    // Two real cases this repairs:
    //   - PDF imports strip indentation, so dialogue arrives flush-left and
    //     `detectElement` would call it "action".
    //   - AI-generated / hand-typed Fountain that puts the dialogue at the
    //     6-space CHARACTER_INDENT (aligned under the cue) instead of 10 — so
    //     `detectElement` mis-reads it as a SECOND character cue, and the editor
    //     then renders the speech UPPERCASE (the "dialogue shows in caps" bug).
    // A genuinely new cue mid-block IS possible (a reply from another speaker:
    // "LUCA (V.O.)"). We keep it as character when the line is cue-SHAPED — all
    // letters uppercase (ignoring a trailing "(V.O.)"-style extension). A speech
    // line is mixed-case, so it converts to dialogue. Parentheticals stay.
    if (inDialogueBlock && (type === "action" || type === "character")) {
      const trimmed = line.trim();
      const withoutExtension = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const looksLikeCue =
        withoutExtension.length > 0 &&
        withoutExtension.length <= 38 &&
        withoutExtension === withoutExtension.toUpperCase() &&
        /[A-ZÀ-Ý]/.test(withoutExtension);
      if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
        type = "parenthetical";
      } else if (type === "character" && looksLikeCue) {
        // a real consecutive cue — leave it as character
        type = "character";
      } else {
        type = "dialogue";
      }
    }

    // Update dialogue block state for the next line.
    if (type === "character") {
      inDialogueBlock = true;
    } else if (type === "parenthetical") {
      // parentheticals keep the block open — dialogue follows
      inDialogueBlock = true;
    } else if (type !== "dialogue") {
      inDialogueBlock = false;
    }

    const content = stripIndent(line, type);

    if (type === "scene") {
      // Every scene heading starts a new scene block
      inDialogueBlock = false;
      flushScene();
      currentHeading = content;
      continue;
    }

    const node = buildBodyNode(type, content);

    if (currentHeading !== null) {
      currentBody.push(node);
    } else {
      // Content before the first scene heading — treat as a top-level transition
      // or action. Wrap in a minimal one-heading scene so the doc invariant
      // (content = "(scene | transition)+") holds.
      topLevelTransitions.push(node);
    }
  }

  flushScene();

  // Content before the first scene heading. `doc` allows a top-level
  // `transition` directly (e.g. an opening "FADE IN:"), so leading transitions
  // are emitted as-is — wrapping them in a synthetic empty-heading scene would
  // create a phantom scene that inflates the scene count and the index ("SCENE 3"
  // for a 2-scene script that opens on FADE IN:). The first non-transition node
  // (rare: action before any heading) and everything after it is wrapped in one
  // synthetic scene, since action is not a valid direct child of `doc`. Order is
  // preserved.
  const firstStrayIdx = topLevelTransitions.findIndex(
    (n) => n.type.name !== "transition",
  );
  const leadingTransitions =
    firstStrayIdx === -1
      ? topLevelTransitions
      : topLevelTransitions.slice(0, firstStrayIdx);
  const strayRest =
    firstStrayIdx === -1 ? [] : topLevelTransitions.slice(firstStrayIdx);
  const syntheticLead =
    strayRest.length > 0
      ? [schema.node("scene", null, [buildHeadingNode("", ""), ...strayRest])]
      : [];
  const allScenes = [...leadingTransitions, ...syntheticLead, ...scenes];

  // An empty doc still needs at least one valid child
  if (allScenes.length === 0) {
    return schema.node("doc", null, [
      schema.node("scene", null, [buildHeadingNode("", "")]),
    ]);
  }

  return schema.node("doc", null, allScenes);
};

const buildBodyNode = (type: ElementType, content: string): Node => {
  const text = content ? [schema.text(content)] : [];
  switch (type) {
    case "character":
      return schema.node("character", null, text);
    case "parenthetical":
      return schema.node("parenthetical", null, text);
    case "dialogue":
      return schema.node("dialogue", null, text);
    case "transition":
      return schema.node("transition", null, text);
    case "action":
    default:
      return schema.node("action", null, text);
  }
};

/**
 * Remove the Fountain indent prefix from a line so the PM node stores only
 * the bare text. The indent is re-added by CSS (margin-inline-start) and by
 * docToFountain when serialising back to Fountain.
 */
const stripIndent = (line: string, type: ElementType): string => {
  switch (type) {
    case "dialogue":
      return line.startsWith(DIALOGUE_INDENT)
        ? line.slice(DIALOGUE_INDENT.length)
        : line.trimStart();
    case "character":
      return line.startsWith(CHARACTER_INDENT)
        ? line.slice(CHARACTER_INDENT.length).trimEnd()
        : line.trim();
    case "parenthetical":
      // Strip any leading whitespace; content includes the parens
      return line.trimStart();
    case "scene": {
      // Remove the INT./EXT. prefix? No — keep full heading text.
      // SCENE_HEADING_RE requires the prefix, so we keep the whole line.
      const match = SCENE_HEADING_RE.exec(line);
      return match ? line : line.trim();
    }
    default:
      return line;
  }
};
