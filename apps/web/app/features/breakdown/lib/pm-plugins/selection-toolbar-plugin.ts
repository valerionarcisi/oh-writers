import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { BreakdownCategory } from "@oh-writers/domain";
import { SelectionToolbar } from "../../components/SelectionToolbar";

export const selectionToolbarPluginKey = new PluginKey(
  "breakdown-selection-toolbar",
);

const DEFAULT_MAX_SELECTION_LENGTH = 200;

export interface SelectionToolbarOptions {
  onTag: (category: BreakdownCategory, text: string, fromPos: number) => void;
  /** Max selection length to show the toolbar (avoid runaway selections). */
  maxLength?: number;
}

export function buildSelectionToolbarPlugin(
  options: SelectionToolbarOptions,
): Plugin {
  const maxLength = options.maxLength ?? DEFAULT_MAX_SELECTION_LENGTH;
  return new Plugin({
    key: selectionToolbarPluginKey,
    view(view) {
      const container = document.createElement("div");
      container.setAttribute("data-selection-toolbar-host", "true");
      document.body.appendChild(container);
      let root: Root | null = createRoot(container);
      let mounted = false;
      let lastFrom = -1;
      let lastTo = -1;

      const dismiss = () => {
        if (!mounted) return;
        root?.render(createElement("div"));
        mounted = false;
        lastFrom = -1;
        lastTo = -1;
      };

      const update = (editorView: EditorView) => {
        const { from, to, empty } = editorView.state.selection;
        const text = editorView.state.doc.textBetween(from, to, " ").trim();
        if (empty || text.length === 0 || text.length > maxLength) {
          dismiss();
          return;
        }
        if (mounted && from === lastFrom && to === lastTo) return;
        lastFrom = from;
        lastTo = to;
        const coords = editorView.coordsAtPos(from);
        const x = (coords.left + coords.right) / 2;
        const y = coords.top;
        root?.render(
          createElement(SelectionToolbar, {
            x,
            y,
            selectedText: text,
            onTag: (category, txt) => {
              options.onTag(category, txt, from);
              dismiss();
              window.getSelection()?.removeAllRanges();
            },
            onDismiss: dismiss,
          }),
        );
        mounted = true;
      };

      update(view);

      return {
        update(editorView) {
          update(editorView);
        },
        destroy() {
          dismiss();
          root?.unmount();
          root = null;
          container.remove();
        },
      };
    },
  });
}
