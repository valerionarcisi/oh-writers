import type { Node } from "prosemirror-model";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";
import { joinHeading } from "@oh-writers/domain";

// Reconstruct the Fountain heading line from the two child slots —
// prefix + title are free-text, so whatever the writer typed round-trips
// verbatim. joinHeading handles empty-slot cases without inserting
// spurious whitespace.
const headingText = (heading: Node): string => {
  let prefix = "";
  let title = "";
  heading.forEach((child) => {
    if (child.type.name === "prefix") prefix = child.textContent;
    else if (child.type.name === "title") title = child.textContent;
  });
  const base = joinHeading({ prefix, title });
  // Locked scene numbers round-trip through Fountain's forced-number syntax
  // (`INT. FOO - DAY #3-3B#`). Unlocked sequential numbers stay implicit so
  // human-edited Fountain files don't accumulate noise.
  const locked = Boolean(heading.attrs["scene_number_locked"]);
  const num = (heading.attrs["scene_number"] as string) ?? "";
  if (locked && num.length > 0) {
    return base.length > 0 ? `${base} #${num}#` : `#${num}#`;
  }
  return base;
};

/**
 * Serialize a ProseMirror document back to Fountain-formatted text.
 *
 * The output is valid Fountain: character cues use CHARACTER_INDENT,
 * dialogue lines use DIALOGUE_INDENT, parentheticals are indented and
 * wrapped in parens, transitions are flush-left with their canonical text.
 *
 * This function is the inverse of fountainToDoc. The roundtrip invariant
 * (fountainToDoc(docToFountain(d)) ~ d) is tested in fountain-roundtrip.test.ts.
 */
export const docToFountain = (doc: Node): string => {
  const lines: string[] = [];

  doc.forEach((scene) => {
    if (scene.type.name !== "scene") return;

    scene.forEach((block, _, index) => {
      const text =
        block.type.name === "heading" ? headingText(block) : block.textContent;

      switch (block.type.name) {
        case "heading":
          // Blank line before each heading except the very first block
          if (lines.length > 0) lines.push("");
          lines.push(text);
          break;

        case "action":
          lines.push("");
          lines.push(text);
          break;

        case "character":
          lines.push("");
          lines.push(`${CHARACTER_INDENT}${text}`);
          break;

        case "parenthetical":
          // No extra blank line — sits right below the character cue or dialogue
          lines.push(`${CHARACTER_INDENT}${text}`);
          break;

        case "dialogue":
          lines.push(`${DIALOGUE_INDENT}${text}`);
          break;

        case "transition":
          lines.push("");
          lines.push(text);
          break;

        default:
          break;
      }
    });
  });

  // Trim leading/trailing blank lines, normalise to a single trailing newline
  return lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "") + "\n";
};
