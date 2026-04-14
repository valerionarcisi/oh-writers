import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";
import type { ElementType } from "./fountain-element-detector";

/**
 * Total column width used to right-align transitions in a monospace buffer.
 *
 * The screenplay page template targets ~60 columns of usable line width at
 * Courier. Transitions sit at the far right, so we pad the content with
 * leading spaces up to `TRANSITION_COLUMN_WIDTH - content.length`.
 *
 * Rationale for 60: matches the visual column of a standard 8.5"x11" page
 * with 1.5" left / 1.0" right margins in 12pt Courier (≈ 60 chars).
 */
export const TRANSITION_COLUMN_WIDTH = 60;

/**
 * Reformat a line so it represents the target element type.
 *
 * Pure function — takes the raw line (including any leading whitespace) and
 * returns a new line with:
 *   - indent corrected for the target element
 *   - caps enforced where the spec requires (scene, character, transition)
 *   - parenthetical wrapping if the target is parenthetical and the content
 *     is not already wrapped
 *   - right-alignment via leading spaces for transition
 *
 * The original content is preserved as-is otherwise (no trimming, no
 * punctuation fixes) so the writer's text is never silently mangled.
 *
 * Empty content is handled naturally — applying "character" to "" returns
 * CHARACTER_INDENT, i.e. an empty indented line ready for the cue.
 */
export const applyElement = (line: string, target: ElementType): string => {
  const content = stripIndent(line);

  switch (target) {
    case "scene":
      return content.toUpperCase();

    case "action":
      return content;

    case "character":
      return CHARACTER_INDENT + content.toUpperCase();

    case "parenthetical":
      return wrapParenthetical(content);

    case "dialogue":
      return DIALOGUE_INDENT + content;

    case "transition":
      return rightAlignTransition(content.toUpperCase());
  }
};

/**
 * Remove leading indent used by the editor's element system.
 * Only strips `CHARACTER_INDENT` / `DIALOGUE_INDENT` prefixes — not arbitrary
 * whitespace — so author-typed leading spaces inside an action line survive.
 */
const stripIndent = (line: string): string => {
  if (line.startsWith(DIALOGUE_INDENT))
    return line.slice(DIALOGUE_INDENT.length);
  if (line.startsWith(CHARACTER_INDENT))
    return line.slice(CHARACTER_INDENT.length);
  return line;
};

const wrapParenthetical = (content: string): string => {
  const trimmed = content.trim();
  // Already wrapped — keep the author's exact spacing inside.
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return DIALOGUE_INDENT + trimmed;
  }
  // Wrap unconditionally. Empty input becomes "()" — cursor lands between the
  // parens when the caller positions it (see keybindings handler).
  return DIALOGUE_INDENT + "(" + trimmed + ")";
};

const rightAlignTransition = (content: string): string => {
  const padding = Math.max(0, TRANSITION_COLUMN_WIDTH - content.length);
  return " ".repeat(padding) + content;
};

/**
 * Element that Enter should produce on the *next* line after the current one.
 *
 * Matches the Spec 05e "Enter behavior" matrix:
 *   scene          → action
 *   action         → action
 *   character      → dialogue
 *   parenthetical  → dialogue
 *   dialogue       → character (next speaker)
 *   transition     → scene
 */
export const nextElementOnEnter = (current: ElementType): ElementType => {
  switch (current) {
    case "scene":
      return "action";
    case "action":
      return "action";
    case "character":
      return "dialogue";
    case "parenthetical":
      return "dialogue";
    case "dialogue":
      return "character";
    case "transition":
      return "scene";
  }
};

/**
 * Element that Tab should switch the *current* line to.
 *
 * Matches the Spec 05e "Tab behavior" matrix:
 *   action         → character
 *   character      → parenthetical
 *   parenthetical  → dialogue
 *   dialogue       → action
 *   scene          → action  (escape hatch when writer tabs on a scene line)
 *   transition     → action  (escape hatch from transition)
 */
export const nextElementOnTab = (current: ElementType): ElementType => {
  switch (current) {
    case "action":
      return "character";
    case "character":
      return "parenthetical";
    case "parenthetical":
      return "dialogue";
    case "dialogue":
      return "action";
    case "scene":
      return "action";
    case "transition":
      return "action";
  }
};
