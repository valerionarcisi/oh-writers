import type { Monaco } from "@monaco-editor/react";

// Character indent: 3 tabs / ~37 spaces (industry standard center position)
const CHARACTER_INDENT = "      "; // ~6 spaces to simulate centering in monospace
// Dialogue indent: ~2.5" from left ≈ 10 spaces
const DIALOGUE_INDENT = "          "; // ~10 spaces

/**
 * Registers Fountain-specific keybindings on an editor instance.
 * Called once via MonacoWrapper's onMount prop.
 *
 * Tab cycles the current line's element type:
 *   action → character cue (centered) → dialogue (indented) → action
 *
 * Enter is context-aware:
 *   CHARACTER line → DIALOGUE indent
 *   PARENTHETICAL  → DIALOGUE indent
 *   anything else  → ACTION (no indent)
 *
 * Both bindings use addAction with keybindingContext so they only fire when
 * the autocomplete suggest widget is NOT visible. When suggestions are shown,
 * Tab/Enter fall through to Monaco's default behaviour (accept suggestion).
 *
 * Ctrl/Cmd+Shift+F dispatches a custom DOM event caught by ScreenplayEditor
 * to toggle focus mode without a prop drilling chain.
 */
export const registerFountainKeybindings = (
  editor: Monaco["editor"]["IStandaloneCodeEditor"],
  monaco: Monaco,
): void => {
  // Tab → cycle element indent
  // keybindingContext ensures this does NOT fire when the suggest widget is open.
  editor.addAction({
    id: "fountain.tab.cycle",
    label: "Fountain: Cycle element type",
    keybindings: [monaco.KeyCode.Tab],
    keybindingContext: "!suggestWidgetVisible && !inSnippetMode",
    run(ed: Monaco["editor"]["IStandaloneCodeEditor"]) {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const trimmed = lineContent.trimStart();

      let newLine: string;

      if (lineContent.startsWith(DIALOGUE_INDENT)) {
        // dialogue → action (remove all leading indent)
        newLine = trimmed;
      } else if (lineContent.startsWith(CHARACTER_INDENT)) {
        // character → dialogue
        newLine = DIALOGUE_INDENT + trimmed;
      } else {
        // action → character cue
        newLine = CHARACTER_INDENT + trimmed.toUpperCase();
      }

      ed.executeEdits("fountain-tab", [
        {
          range: new monaco.Range(
            position.lineNumber,
            1,
            position.lineNumber,
            model.getLineLength(position.lineNumber) + 1,
          ),
          text: newLine,
        },
      ]);

      // Move cursor to end of new line
      ed.setPosition({
        lineNumber: position.lineNumber,
        column: newLine.length + 1,
      });
    },
  });

  // Enter → context-aware next element type
  // keybindingContext ensures this does NOT fire when the suggest widget is open.
  editor.addAction({
    id: "fountain.enter.smart",
    label: "Fountain: Smart Enter",
    keybindings: [monaco.KeyCode.Enter],
    keybindingContext: "!suggestWidgetVisible && !inSnippetMode",
    run(ed: Monaco["editor"]["IStandaloneCodeEditor"]) {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const isCharacter =
        lineContent.startsWith(CHARACTER_INDENT) &&
        !lineContent.startsWith(DIALOGUE_INDENT);
      const isParenthetical =
        lineContent.trimStart().startsWith("(") &&
        lineContent.trimStart().endsWith(")");

      // CHARACTER and parenthetical → next line is DIALOGUE; everything else → ACTION
      const prefix = isCharacter || isParenthetical ? DIALOGUE_INDENT : "";

      const col = position.column;
      const lineLen = model.getLineLength(position.lineNumber);

      ed.executeEdits("fountain-enter", [
        {
          range: new monaco.Range(
            position.lineNumber,
            col,
            position.lineNumber,
            lineLen + 1,
          ),
          text: "\n" + prefix,
        },
      ]);
      ed.setPosition({
        lineNumber: position.lineNumber + 1,
        column: prefix.length + 1,
      });
    },
  });

  // Ctrl/Cmd+Shift+F → toggle focus mode
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
    () => {
      window.dispatchEvent(new CustomEvent("screenplay:toggleFocusMode"));
    },
  );
};
