import type { Monaco } from "@monaco-editor/react";

/*
 * Screenplay page palette — light theme to match the physical page aesthetic.
 * The editor sits inside a white "paper" card; text is near-black for
 * print-like legibility.
 */
const COLORS = {
  sceneHeading: "#1a1100", // near-black warm — bold scene headings stand out
  character: "#111111", // true black for character cues
  parenthetical: "#6b6860", // grey — recedes from the dialogue
  dialogue: "#1c1c1a", // near-black for readable dialogue
  transition: "#6b6860", // grey — same as parenthetical
  action: "#2a2825", // warm dark — body text
  comment: "#a09d97", // light grey — boneyards barely visible
  bg: "#f8f6f0", // warm white — the paper
  bgSurface: "#f8f6f0",
  selection: "#d4e4f7", // light blue selection
  cursor: "#111111",
  lineNumber: "#c5c2bb",
};

let languageRegistered = false;

/**
 * Registers the fountain-screenplay language and fountain-dark theme with Monaco.
 * Language + tokenizer are registered once (Monaco throws on duplicate).
 * Theme is always re-defined so HMR picks up palette changes immediately.
 */
export const registerFountainLanguage = (monaco: Monaco): void => {
  if (!languageRegistered) {
    languageRegistered = true;

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
  }

  // Theme is always re-defined — safe to call on every mount / HMR cycle
  monaco.editor.defineTheme("fountain-dark", {
    base: "vs", // light base — rendering on a white page
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
      "editor.lineHighlightBackground": "#f0ede4",
      "editorCursor.foreground": COLORS.cursor,
      "editorLineNumber.foreground": COLORS.lineNumber,
      "editorLineNumber.activeForeground": COLORS.action,
      "editor.inactiveSelectionBackground": "#dde8f4",
      "scrollbarSlider.background": "#d0cdc6",
      "scrollbarSlider.hoverBackground": "#b8b5ae",
      "editorSuggestWidget.background": "#ffffff",
      "editorSuggestWidget.border": "#d0cdc6",
      "editorSuggestWidget.foreground": COLORS.action,
      "editorSuggestWidget.selectedBackground": "#e8e4dc",
      "editorSuggestWidget.selectedForeground": COLORS.character,
      "editorSuggestWidget.highlightForeground": "#b87a00",
      "editorSuggestWidget.focusHighlightForeground": "#b87a00",
      "list.activeSelectionBackground": "#e8e4dc",
      "list.activeSelectionForeground": COLORS.character,
      "list.hoverBackground": "#f0ede4",
      "list.focusBackground": "#e8e4dc",
      "list.highlightForeground": "#b87a00",
    },
  });

  // Force Monaco to apply the freshly-defined theme
  monaco.editor.setTheme("fountain-dark");
};
