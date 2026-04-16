import type { Monaco } from "@monaco-editor/react";
import {
  CHARACTER_INDENT,
  DIALOGUE_INDENT,
  FOUNTAIN_TRANSITIONS,
  SCENE_HEADING_RE,
  TRANSITION_SET,
} from "./fountain-constants";

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
 * Counts the number of scene headings that appear before a given line number (1-based).
 * Used to suggest the next scene number when the user starts a new scene heading.
 */
export const sceneNumberBefore = (
  content: string,
  lineNumber: number,
): number => {
  const lines = content.split("\n");
  let count = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    if (SCENE_HEADING_RE.test(lines[i]!.trimStart())) count++;
  }
  return count;
};

/**
 * Extracts all unique locations from scene headings.
 * Captures the part between the prefix and the optional " - TIME" suffix.
 * Supports English (INT./EXT.) and Italian (INT./EST.) conventions.
 * e.g. "INT. COFFEE SHOP - DAY" → "COFFEE SHOP"
 */
export const extractLocations = (content: string): string[] => {
  const locs = new Set<string>();
  // Accept both ASCII hyphen ( - ) and em dash ( – ) as the separator between
  // location and time-of-day, since copy-pasted or imported content often uses
  // the typographic dash.
  const headingRe =
    /^(?:INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E)\s+(.+?)(?:\s+[-–]\s+.+)?$/;
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

      // Scene heading autocomplete: after INT. / EXT. / EST. / combined forms at start of line
      const trimmed = lineContent.trimStart();
      if (
        /^(?:INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E)\s/.test(
          trimmed,
        )
      ) {
        const locations = extractLocations(content);
        const nextSceneNum =
          sceneNumberBefore(content, position.lineNumber) + 1;
        const prefixLen = trimmed.search(/\s/) + 1; // length of "INT. " including space
        const startCol = lineContent.length - trimmed.length + prefixLen + 1;
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: startCol,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        // Scene number hint — always first in the list
        const sceneNumSuggestion = {
          label: `${nextSceneNum}.`,
          detail: `Scene ${nextSceneNum}`,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: "",
          sortText: "0",
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        };

        return {
          suggestions: [
            sceneNumSuggestion,
            ...locations.map((loc) => ({
              label: loc,
              detail: `Scene ${nextSceneNum}`,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: loc,
              sortText: "1" + loc,
              range,
            })),
          ],
        };
      }

      // Transitions: all-caps line at column 0, not a scene heading
      const isAtRoot = lineContent === lineContent.trimStart();
      const isSceneStart = /^(?:INT\.|EXT\.|EST\.|I\/E)/.test(
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
