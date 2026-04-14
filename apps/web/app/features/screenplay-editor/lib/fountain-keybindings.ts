import type { Monaco } from "@monaco-editor/react";
import { detectElement } from "./fountain-element-detector";
import {
  applyElement,
  nextElementOnEnter,
  nextElementOnTab,
} from "./fountain-element-transforms";

/**
 * Registers Fountain-specific keybindings on an editor instance.
 * Called once via MonacoWrapper's onMount prop.
 *
 * Tab and Enter are element-aware: they detect the current line's element
 * type and switch to the next type from the Spec 05e flow matrix.
 *
 * Both bindings use keybindingContext so they only fire when the autocomplete
 * suggest widget is NOT visible. When suggestions are shown, Tab/Enter fall
 * through to Monaco's default behaviour (accept suggestion).
 *
 * Ctrl/Cmd+Shift+F dispatches a custom DOM event caught by ScreenplayEditor
 * to toggle focus mode without a prop drilling chain.
 */
export const registerFountainKeybindings = (
  editor: Monaco["editor"]["IStandaloneCodeEditor"],
  monaco: Monaco,
): void => {
  editor.addAction({
    id: "fountain.tab.cycle",
    label: "Fountain: Cycle element type",
    keybindings: [monaco.KeyCode.Tab],
    keybindingContext: "!suggestWidgetVisible && !inSnippetMode",
    run: (ed: Monaco["editor"]["IStandaloneCodeEditor"]) => runTab(ed, monaco),
  });

  editor.addAction({
    id: "fountain.enter.smart",
    label: "Fountain: Smart Enter",
    keybindings: [monaco.KeyCode.Enter],
    keybindingContext: "!suggestWidgetVisible && !inSnippetMode",
    run: (ed: Monaco["editor"]["IStandaloneCodeEditor"]) =>
      runEnter(ed, monaco),
  });

  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
    () => {
      window.dispatchEvent(new CustomEvent("screenplay:toggleFocusMode"));
    },
  );
};

const runTab = (
  ed: Monaco["editor"]["IStandaloneCodeEditor"],
  monaco: Monaco,
): void => {
  const model = ed.getModel();
  const position = ed.getPosition();
  if (!model || !position) return;

  const lineContent = model.getLineContent(position.lineNumber);
  const prevLine =
    position.lineNumber > 1
      ? model.getLineContent(position.lineNumber - 1)
      : null;

  const current = detectElement(lineContent, prevLine);
  const target = nextElementOnTab(current);
  const newLine = applyElement(lineContent, target);

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

  ed.setPosition({
    lineNumber: position.lineNumber,
    column: caretColumnFor(target, newLine),
  });
};

const runEnter = (
  ed: Monaco["editor"]["IStandaloneCodeEditor"],
  monaco: Monaco,
): void => {
  const model = ed.getModel();
  const position = ed.getPosition();
  if (!model || !position) return;

  const lineContent = model.getLineContent(position.lineNumber);
  const prevLine =
    position.lineNumber > 1
      ? model.getLineContent(position.lineNumber - 1)
      : null;

  const current = detectElement(lineContent, prevLine);
  const target = nextElementOnEnter(current);
  const newPrefix = applyElement("", target);

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
      text: "\n" + newPrefix,
    },
  ]);
  ed.setPosition({
    lineNumber: position.lineNumber + 1,
    column: caretColumnFor(target, newPrefix),
  });
};

/**
 * Where the caret should land after the line has been reformatted.
 *
 * For parenthetical we place the caret *inside* the parens so the writer can
 * start typing the beat immediately. For everything else, the caret goes to
 * the end of the line — standard behaviour.
 */
const caretColumnFor = (target: string, newLine: string): number => {
  if (target === "parenthetical") {
    const openIdx = newLine.indexOf("(");
    if (openIdx >= 0) return openIdx + 2; // Monaco columns are 1-based, +1 for "(", +1 for 1-based
  }
  return newLine.length + 1;
};
