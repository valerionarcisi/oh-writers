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

    // Blank lines end a dialogue block — what follows is no longer dialogue.
    if (line.trim() === "") {
      inDialogueBlock = false;
      continue;
    }

    let type: ElementType = detectElement(line, prev);

    // Context-aware reclassification for PDF-imported Fountain:
    // after a character cue (or parenthetical inside a dialogue block),
    // unindented lines that would otherwise fall to "action" are dialogue.
    if (inDialogueBlock && type === "action") {
      const trimmed = line.trim();
      if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
        type = "parenthetical";
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

  // If there was content before the first scene (unusual), prepend it wrapped
  // in a synthetic scene with an empty heading.
  const allScenes =
    topLevelTransitions.length > 0
      ? [
          schema.node("scene", null, [
            buildHeadingNode("", ""),
            ...topLevelTransitions,
          ]),
          ...scenes,
        ]
      : scenes;

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
