import { Node } from "prosemirror-model";
import { schema } from "./schema";
import { detectElement } from "./fountain-element-detector";
import type { ElementType } from "./fountain-element-detector";
import {
  CHARACTER_INDENT,
  DIALOGUE_INDENT,
  SCENE_HEADING_RE,
} from "./fountain-constants";

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
    const headingNode = schema.node(
      "heading",
      null,
      currentHeading ? [schema.text(currentHeading)] : [],
    );
    scenes.push(schema.node("scene", null, [headingNode, ...currentBody]));
    currentHeading = null;
    currentBody = [];
  };

  // Top-level transitions (e.g. FADE OUT. at the very end, outside a scene)
  const topLevelTransitions: Node[] = [];

  for (let i = 0; i < lines.length; i++) {
    // lines[i] is always defined inside bounds — TS noUncheckedIndexedAccess guard
    const line = lines[i] as string;
    const prev = i > 0 ? (lines[i - 1] as string) : null;
    const type: ElementType = detectElement(line, prev);
    const content = stripIndent(line, type);

    if (type === "scene") {
      // Every scene heading starts a new scene block
      flushScene();
      currentHeading = content;
      continue;
    }

    // Skip truly blank lines — they are whitespace separators in Fountain,
    // not content nodes. Block-level spacing is handled by CSS margins.
    if (line.trim() === "") continue;

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
            schema.node("heading", null, []),
            ...topLevelTransitions,
          ]),
          ...scenes,
        ]
      : scenes;

  // An empty doc still needs at least one valid child
  if (allScenes.length === 0) {
    return schema.node("doc", null, [
      schema.node("scene", null, [schema.node("heading", null, [])]),
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
