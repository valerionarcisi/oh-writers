import type { Monaco } from "@monaco-editor/react";

/**
 * Industry-standard screenplay page: 55 lines per page at 12pt Courier.
 * This matches the page-counter.ts constant.
 */
const LINES_PER_PAGE = 55;

/**
 * CSS class injected into the document once to style page-break decorations.
 * Using a data attribute so the injection is idempotent.
 */
const injectPageBreakStyles = (): void => {
  if (document.querySelector("[data-fountain-page-break-styles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-fountain-page-break-styles", "true");
  style.textContent = `
    /* Page break — simulates the gap between physical pages */
    .fountain-page-break-line {
      border-top: 2px dashed rgba(100, 98, 94, 0.35) !important;
      margin-top: 12px !important;
    }
    .fountain-page-break-line::before {
      content: attr(data-page-label);
      position: absolute;
      inset-inline-end: 8px;
      font-size: 10px;
      font-family: var(--font-sans, system-ui);
      color: rgba(100, 98, 94, 0.5);
      line-height: 1;
      top: -16px;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
};

/**
 * Registers and continuously updates page-break decorations on the editor.
 * A decoration is placed at the first line of each page (line 56, 111, 166, …).
 * Called once from registerFountainKeybindings after the editor is mounted.
 */
export const registerFountainPageBreaks = (
  editor: Monaco["editor"]["IStandaloneCodeEditor"],
  monaco: Monaco,
): void => {
  injectPageBreakStyles();

  let decorationIds: string[] = [];

  const updateDecorations = (): void => {
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const newDecorations: Monaco["editor"]["IModelDeltaDecoration"][] = [];

    // Place a break line at the start of every page after the first
    for (
      let page = 2;
      page * LINES_PER_PAGE - LINES_PER_PAGE < lineCount;
      page++
    ) {
      const breakLine = (page - 1) * LINES_PER_PAGE + 1;
      if (breakLine > lineCount) break;
      newDecorations.push({
        range: new monaco.Range(breakLine, 1, breakLine, 1),
        options: {
          isWholeLine: true,
          className: "fountain-page-break-line",
          stickiness:
            monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    decorationIds = editor.deltaDecorations(decorationIds, newDecorations);
  };

  // Initial render
  updateDecorations();

  // Keep decorations in sync with content changes
  editor.onDidChangeModelContent(() => updateDecorations());
};
