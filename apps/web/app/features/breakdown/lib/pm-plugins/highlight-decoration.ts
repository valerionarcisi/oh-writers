import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { findOccurrencesInDoc, type ElementForMatch } from "./find-occurrences";

interface HighlightState {
  elements: ElementForMatch[];
  decos: DecorationSet;
}

export const highlightPluginKey = new PluginKey<HighlightState>(
  "breakdown-highlight",
);

interface Options {
  /** Initial element list. */
  initial: ElementForMatch[];
  /** CSS class applied to every highlight span. */
  className: string;
}

/** Meta payload to update the element list at runtime. */
export type HighlightMeta = { setElements: ElementForMatch[] };

function buildDecos(
  doc: PMNode,
  elements: ElementForMatch[],
  className: string,
): DecorationSet {
  const ranges = findOccurrencesInDoc(doc, elements);
  return DecorationSet.create(
    doc,
    ranges.map((r) =>
      Decoration.inline(r.from, r.to, {
        class: className,
        "data-cat": r.category,
        "data-element-id": r.elementId,
        "data-stale": r.isStale ? "true" : "false",
      }),
    ),
  );
}

export function buildHighlightPlugin({ initial, className }: Options): Plugin {
  return new Plugin<HighlightState>({
    key: highlightPluginKey,
    state: {
      init(_, state) {
        return {
          elements: initial,
          decos: buildDecos(state.doc, initial, className),
        };
      },
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(highlightPluginKey) as
          | HighlightMeta
          | undefined;
        const elements = meta?.setElements ?? prev.elements;
        if (!meta && !tr.docChanged) return prev;
        return {
          elements,
          decos: buildDecos(newState.doc, elements, className),
        };
      },
    },
    props: {
      decorations(state) {
        return highlightPluginKey.getState(state)?.decos;
      },
    },
  });
}
