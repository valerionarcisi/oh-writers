import type { Monaco } from "@monaco-editor/react";

const CHARACTER_INDENT = "      "; // 6 spaces — matches fountain-keybindings.ts
const DIALOGUE_INDENT = "          "; // 10 spaces

const FOUNTAIN_TRANSITIONS = [
  "FADE IN:",
  "FADE OUT:",
  "CUT TO:",
  "SMASH CUT TO:",
  "DISSOLVE TO:",
  "MATCH CUT TO:",
  "JUMP CUT TO:",
];

/**
 * Extracts all unique character names from screenplay content.
 *
 * Recognises two formats:
 *   1. Tab-indented lines (CHARACTER_INDENT but not DIALOGUE_INDENT) — produced
 *      by the Fountain keybinding Tab cycle when the user types in the editor.
 *   2. Standard Fountain character cues — an ALL-CAPS line at column 0 that is
 *      not a scene heading and not a known transition.  This covers imported /
 *      seeded Fountain files that don't use the editor's indentation scheme.
 *
 * Parenthetical extensions like (V.O.) are stripped before collecting.
 */

const SCENE_HEADING_RE = /^(?:INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E)\s/;
const TRANSITION_SET = new Set(FOUNTAIN_TRANSITIONS);

export const extractCharacterNames = (content: string): string[] => {
  const names = new Set<string>();
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const isIndentedCue =
      line.startsWith(CHARACTER_INDENT) && !line.startsWith(DIALOGUE_INDENT);

    // Standard Fountain cue: all-caps at column 0, preceded by a blank line
    const isPlainCue =
      !isIndentedCue &&
      line === line.trimStart() &&
      !SCENE_HEADING_RE.test(line) &&
      (i === 0 || lines[i - 1]!.trim() === "");

    if (!isIndentedCue && !isPlainCue) continue;

    const trimmed = line.trim();
    const name = trimmed.replace(/\s*\(.*\)\s*$/, "").trim();
    if (
      name.length > 0 &&
      name === name.toUpperCase() &&
      /[A-Z]/.test(name) &&
      !TRANSITION_SET.has(name) &&
      !TRANSITION_SET.has(trimmed)
    ) {
      names.add(name);
    }
  }
  return [...names].sort();
};

/**
 * Extracts all unique locations from scene headings.
 * Captures the part between the INT./EXT. prefix and the optional " - TIME" suffix.
 * e.g. "INT. COFFEE SHOP - DAY" → "COFFEE SHOP"
 */
export const extractLocations = (content: string): string[] => {
  const locs = new Set<string>();
  const headingRe =
    /^(?:INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E)\s+(.+?)(?:\s+-\s+.+)?$/;
  for (const line of content.split("\n")) {
    const match = headingRe.exec(line.trim());
    if (match?.[1]) {
      locs.add(match[1].trim());
    }
  }
  return [...locs].sort();
};

/**
 * Registers Monaco completion providers for Fountain character names and scene locations.
 * Must be called after registerFountainLanguage so the language ID is already registered.
 *
 * `getContent` is a ref-based accessor — the provider always reads the latest editor
 * content without needing to be re-registered on every change.
 */
type ITextModel = Monaco["editor"]["ITextModel"];
type IPosition = { lineNumber: number; column: number };

export const registerFountainAutocomplete = (
  monaco: Monaco,
  getContent: () => string,
): Monaco["languages"]["IDisposable"] =>
  monaco.languages.registerCompletionItemProvider("fountain-screenplay", {
    provideCompletionItems(model: ITextModel, position: IPosition) {
      const lineContent = model.getLineContent(position.lineNumber);
      const content = getContent();

      // Character autocomplete: only on character-indented lines
      if (
        lineContent.startsWith(CHARACTER_INDENT) &&
        !lineContent.startsWith(DIALOGUE_INDENT)
      ) {
        // Exclude the current line so the partially-typed name isn't suggested as itself
        const lines = content.split("\n");
        lines[position.lineNumber - 1] = "";
        const names = extractCharacterNames(lines.join("\n"));
        const word = model.getWordAtPosition(position);
        const range = word
          ? {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            }
          : {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            };

        return {
          suggestions: names.map((name) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: name,
            range,
          })),
        };
      }

      // Scene heading autocomplete: after INT. / EXT. / INT./EXT. at start of line
      const trimmed = lineContent.trimStart();
      if (/^(?:INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E)\s/.test(trimmed)) {
        const locations = extractLocations(content);
        const prefixLen = trimmed.search(/\s/) + 1; // length of "INT. " including space
        const startCol = lineContent.length - trimmed.length + prefixLen + 1;
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: startCol,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        return {
          suggestions: locations.map((loc) => ({
            label: loc,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: loc,
            range,
          })),
        };
      }

      // Transitions: all-caps line at column 0, not a scene heading
      const isAtRoot = lineContent === lineContent.trimStart();
      const isSceneStart = /^(?:INT\.|EXT\.|I\/E)/.test(
        lineContent.trimStart(),
      );
      const trimmedLine = lineContent.trim();
      const isAllCaps =
        trimmedLine.length === 0 || trimmedLine === trimmedLine.toUpperCase();

      if (isAtRoot && !isSceneStart && isAllCaps) {
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        return {
          suggestions: FOUNTAIN_TRANSITIONS.map((t) => ({
            label: t,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: t,
            range,
          })),
        };
      }

      return { suggestions: [] };
    },
  });
