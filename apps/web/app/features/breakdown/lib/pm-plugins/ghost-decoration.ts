import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { findOccurrencesInDoc, type ElementForMatch } from "./find-occurrences";

interface GhostState {
  elements: ElementForMatch[];
  decos: DecorationSet;
}

export const ghostPluginKey = new PluginKey<GhostState>("breakdown-ghost");

export type GhostMeta = { setElements: ElementForMatch[] };

interface Options {
  initial: ElementForMatch[];
  className: string;
}

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
        "data-ghost": "true",
        "data-element-id": r.elementId,
      }),
    ),
  );
}

export function buildGhostPlugin({ initial, className }: Options): Plugin {
  return new Plugin<GhostState>({
    key: ghostPluginKey,
    state: {
      init(_, state) {
        return {
          elements: initial,
          decos: buildDecos(state.doc, initial, className),
        };
      },
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(ghostPluginKey) as GhostMeta | undefined;
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
        return ghostPluginKey.getState(state)?.decos;
      },
    },
  });
}
