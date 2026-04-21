import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { BreakdownCategory } from "@oh-writers/domain";
import { SelectionToolbar } from "../../components/SelectionToolbar";

export const selectionToolbarPluginKey = new PluginKey(
  "breakdown-selection-toolbar",
);

export interface SelectionToolbarOptions {
  onTag: (category: BreakdownCategory, text: string, fromPos: number) => void;
  /** Max selection length to show the toolbar (avoid runaway selections). */
  maxLength?: number;
}

export function buildSelectionToolbarPlugin(
  options: SelectionToolbarOptions,
): Plugin {
  const maxLength = options.maxLength ?? 200;
  return new Plugin({
    key: selectionToolbarPluginKey,
    view(view) {
      const container = document.createElement("div");
      container.setAttribute("data-selection-toolbar-host", "true");
      document.body.appendChild(container);
      let root: Root | null = createRoot(container);
      let mounted = false;

      const dismiss = () => {
        if (!mounted) return;
        root?.render(createElement("div"));
        mounted = false;
      };

      const update = (editorView: EditorView) => {
        const { from, to, empty } = editorView.state.selection;
        const text = editorView.state.doc.textBetween(from, to, " ").trim();
        if (empty || text.length === 0 || text.length > maxLength) {
          dismiss();
          return;
        }
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
