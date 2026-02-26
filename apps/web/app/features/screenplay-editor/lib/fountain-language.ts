import type { Monaco } from "@monaco-editor/react";

// Editorial Dark palette — mirrors tokens.css values directly
const COLORS = {
  sceneHeading: "#d4a843", // --color-accent (amber)
  character: "#f0ede6", // --color-fg (warm white, bold)
  parenthetical: "#9e9b94", // --color-muted
  dialogue: "#f0ede6", // --color-fg
  transition: "#9e9b94", // --color-muted
  action: "#c8c5be", // --color-gray-700
  comment: "#5c5a55", // --color-placeholder
  bg: "#0e0e0c", // --color-bg
  bgSurface: "#1a1917", // --color-surface
  selection: "#2e2d2a", // --color-subtle
  cursor: "#f0ede6", // --color-fg
  lineNumber: "#5c5a55", // --color-placeholder
};

let registered = false;

/**
 * Registers the fountain-screenplay language and fountain-dark theme with Monaco.
 * Safe to call multiple times — guards against double registration.
 */
export const registerFountainLanguage = (monaco: Monaco): void => {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: "fountain-screenplay" });

  // Tokenizer — order matters: more specific rules first
  monaco.languages.setMonarchTokensProvider("fountain-screenplay", {
    tokenizer: {
      root: [
        // Scene headings: INT. / EXT. / INT./EXT. / I/E at start of line
        [/^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E).*$/, "scene-heading"],

        // Forced scene heading with leading dot (.SCENE)
        [/^\.[A-Z].*$/, "scene-heading"],

        // Transitions: ALL CAPS ending with TO: or FADE IN/FADE OUT/SMASH CUT etc.
        [
          /^[A-Z][A-Z\s]+(?:TO:|IN\.|OUT\.)?\s*$/,
          { token: "transition", next: "@transition" },
        ],

        // Character cues: ALL CAPS, possibly with extension like (V.O.) or (O.S.)
        // Must be preceded by a blank line in real Fountain, but tokenizer works line-by-line
        [
          /^[ \t]{3,}[A-Z][A-Z0-9 ]+(?:\s*\(.*\))?\s*$/,
          { token: "character", next: "@dialogue" },
        ],

        // Parenthetical at start of dialogue block
        [/^[ \t]*\(.*\)\s*$/, "parenthetical"],

        // Boneyard (block comment)
        [/\/\*/, "comment", "@boneyard"],

        // Note: [[text]]
        [/\[\[.*\]\]/, "comment"],

        // Everything else is action
        [/.+/, "action"],
      ],

      dialogue: [
        // Parenthetical within dialogue
        [/^[ \t]*\(.*\)\s*$/, "parenthetical"],
        // Blank line ends dialogue block
        [/^\s*$/, { token: "", next: "@root" }],
        // Dialogue text
        [/.+/, "dialogue"],
      ],

      transition: [[/.*/, { token: "transition", next: "@root" }]],

      boneyard: [
        [/\*\//, "comment", "@pop"],
        [/[^*]+/, "comment"],
        [/\*/, "comment"],
      ],
    },
  });

  monaco.editor.defineTheme("fountain-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      {
        token: "scene-heading",
        foreground: COLORS.sceneHeading.slice(1),
        fontStyle: "bold",
      },
      {
        token: "character",
        foreground: COLORS.character.slice(1),
        fontStyle: "bold",
      },
      {
        token: "parenthetical",
        foreground: COLORS.parenthetical.slice(1),
        fontStyle: "italic",
      },
      { token: "dialogue", foreground: COLORS.dialogue.slice(1) },
      {
        token: "transition",
        foreground: COLORS.transition.slice(1),
        fontStyle: "italic",
      },
      { token: "action", foreground: COLORS.action.slice(1) },
      {
        token: "comment",
        foreground: COLORS.comment.slice(1),
        fontStyle: "italic",
      },
      { token: "", foreground: COLORS.action.slice(1) },
    ],
    colors: {
      "editor.background": COLORS.bgSurface,
      "editor.foreground": COLORS.action,
      "editor.selectionBackground": COLORS.selection,
      "editor.lineHighlightBackground": COLORS.bg,
      "editorCursor.foreground": COLORS.cursor,
      "editorLineNumber.foreground": COLORS.lineNumber,
      "editorLineNumber.activeForeground": COLORS.action,
      "editor.inactiveSelectionBackground": COLORS.selection,
      "scrollbarSlider.background": COLORS.selection,
      "scrollbarSlider.hoverBackground": COLORS.selection,
      // Suggest widget
      "editorSuggestWidget.background": COLORS.bgSurface,
      "editorSuggestWidget.border": COLORS.selection,
      "editorSuggestWidget.foreground": COLORS.action,
      "editorSuggestWidget.selectedBackground": COLORS.selection,
      "editorSuggestWidget.selectedForeground": COLORS.character,
      "editorSuggestWidget.highlightForeground": COLORS.sceneHeading,
      "editorSuggestWidget.focusHighlightForeground": COLORS.sceneHeading,
      "list.activeSelectionBackground": COLORS.selection,
      "list.activeSelectionForeground": COLORS.character,
      "list.hoverBackground": COLORS.bg,
      "list.focusBackground": COLORS.selection,
      "list.highlightForeground": COLORS.sceneHeading,
    },
  });
};
