import type { Monaco } from "@monaco-editor/react";
import type { ElementType } from "./fountain-element-detector";
import { applyElement } from "./fountain-element-transforms";

/**
 * Inline element picker — shown when the cursor is on an empty line.
 *
 * Renders a compact strip of 6 buttons directly below the cursor.
 * Selecting a button reformats the current line as the chosen element and
 * places the caret at the correct position (inside parens for parenthetical,
 * end-of-line for everything else).
 *
 * Lifecycle:
 *   - Created once via `registerFountainElementPicker`
 *   - Shown/hidden on each cursor change via `editor.onDidChangeCursorPosition`
 *   - Dismissed when the user types any key, clicks outside, or moves the
 *     cursor to a non-empty line
 *
 * The widget DOM node is built once and reused across show/hide cycles to
 * avoid repeated GC pressure during editing.
 */

interface PickerItem {
  label: string;
  shortcut: string;
  target: ElementType;
}

const PICKER_ITEMS: PickerItem[] = [
  { label: "Scene", shortcut: "S", target: "scene" },
  { label: "Action", shortcut: "A", target: "action" },
  { label: "Character", shortcut: "C", target: "character" },
  { label: "Dialogue", shortcut: "D", target: "dialogue" },
  { label: "Paren", shortcut: "P", target: "parenthetical" },
  { label: "Trans", shortcut: "T", target: "transition" },
];

/**
 * Determines whether a line should trigger the element picker.
 * An empty or indent-only line at rest counts as "awaiting input".
 */
const isEmptyLine = (line: string): boolean => line.trim() === "";

/**
 * Where the caret should land after applying the element.
 * Mirrors the logic in `caretColumnFor` in fountain-keybindings.ts.
 */
const caretColumnFor = (target: ElementType, newLine: string): number => {
  if (target === "parenthetical") {
    const openIdx = newLine.indexOf("(");
    if (openIdx >= 0) return openIdx + 2;
  }
  return newLine.length + 1;
};

export const registerFountainElementPicker = (
  editor: Monaco["editor"]["IStandaloneCodeEditor"],
  monaco: Monaco,
): void => {
  // --- Build the DOM node once ---
  const domNode = document.createElement("div");
  domNode.setAttribute("data-fountain-picker", "true");
  domNode.style.cssText = [
    "display:none",
    "position:absolute",
    "z-index:9",
    "background:var(--color-bg-elevated,#242320)",
    "border:1px solid var(--color-border,#2e2d2a)",
    "border-radius:var(--radius-md,8px)",
    "padding:2px 4px",
    "display:flex",
    "align-items:center",
    "gap:2px",
    "box-shadow:0 4px 12px rgba(0,0,0,.45)",
    "pointer-events:auto",
    "font-family:var(--font-sans,'Inter',system-ui,sans-serif)",
  ].join(";");
  domNode.style.display = "none";

  // --- Build buttons ---
  for (const item of PICKER_ITEMS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-target", item.target);
    btn.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:4px",
      "background:transparent",
      "border:none",
      "border-radius:var(--radius-sm,4px)",
      "padding:3px 6px",
      "cursor:pointer",
      "color:var(--color-text-secondary,#9e9b94)",
      "font-size:11px",
      "font-family:inherit",
      "line-height:1",
      "transition:background 100ms ease,color 100ms ease",
      "white-space:nowrap",
    ].join(";");

    const labelSpan = document.createElement("span");
    labelSpan.textContent = item.label;

    const kbdSpan = document.createElement("kbd");
    kbdSpan.style.cssText = [
      "display:inline-block",
      "background:var(--color-bg-subtle,#2e2d2a)",
      "border-radius:3px",
      "padding:1px 4px",
      "font-size:10px",
      "font-family:inherit",
      "color:var(--color-text-muted,#5c5a55)",
      "line-height:1.4",
    ].join(";");
    kbdSpan.textContent = `⌥${item.shortcut}`;

    btn.appendChild(labelSpan);
    btn.appendChild(kbdSpan);

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--color-bg-subtle,#2e2d2a)";
      btn.style.color = "var(--color-text-primary,#f0ede6)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
      btn.style.color = "var(--color-text-secondary,#9e9b94)";
    });

    // Mousedown — prevent focus leaving the editor, then apply the element
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      applyAndDismiss(item.target);
    });

    domNode.appendChild(btn);
  }

  // --- Monaco IContentWidget ---
  let currentLine = 0;

  const widget: Monaco["editor"]["IContentWidget"] = {
    getId: () => "fountain.element-picker",

    getDomNode: () => domNode,

    getPosition: () => ({
      position: { lineNumber: currentLine, column: 1 },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.BELOW,
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
      ],
    }),
  };

  editor.addContentWidget(widget);

  // --- Show / hide logic ---
  let isVisible = false;

  const show = (lineNumber: number): void => {
    currentLine = lineNumber;
    domNode.style.display = "flex";
    isVisible = true;
    editor.layoutContentWidget(widget);
  };

  const hide = (): void => {
    domNode.style.display = "none";
    isVisible = false;
  };

  const applyAndDismiss = (target: ElementType): void => {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) return;

    const lineContent = model.getLineContent(position.lineNumber);
    const newLine = applyElement(lineContent, target);

    editor.executeEdits("fountain-element-picker", [
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

    editor.setPosition({
      lineNumber: position.lineNumber,
      column: caretColumnFor(target, newLine),
    });

    hide();
    editor.focus();
  };

  // --- Cursor change → show or hide ---
  editor.onDidChangeCursorPosition(() => {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) {
      hide();
      return;
    }

    const line = model.getLineContent(position.lineNumber);
    if (isEmptyLine(line)) {
      show(position.lineNumber);
    } else {
      hide();
    }
  });

  // --- Content change → hide if line is no longer empty ---
  editor.onDidChangeModelContent(() => {
    if (!isVisible) return;
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) {
      hide();
      return;
    }
    const line = model.getLineContent(position.lineNumber);
    if (!isEmptyLine(line)) {
      hide();
    }
  });
};
