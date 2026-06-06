// apps/web/app/features/documents/lib/cesare-highlight-plugin.ts
//
// Spec 63 — the ProseMirror plugin that underlines "what Cesare changed" ON the
// real document text (not an overlay, not the split). It reads the per-document
// highlight store and decorates the ranges where the added text fragments occur
// in the current doc, so the writer sees the change inline in the prose.
//
// Fragments are the diff's added words/phrases (already applied to the doc). We
// locate each fragment's occurrence in the text and add an inline decoration. We
// search the document's textContent so a fragment spanning marks/nodes still
// matches; positions map back through ProseMirror's block offsets.

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import {
  getHighlightFragments,
  subscribeHighlight,
} from "./cesare-highlight-store";

export const cesareHighlightKey = new PluginKey<DecorationSet>(
  "cesareHighlight",
);

const HIGHLIGHT_CLASS = "cesare-change-underline";

/** Find inline decorations for every fragment occurrence inside text nodes. We
 *  decorate per text node (block-local) so a fragment that appears in a node is
 *  underlined where it sits; this keeps the highlight block-level and robust to
 *  marks without needing a global text-offset map. */
function buildDecorations(
  doc: PMNode,
  fragments: ReadonlyArray<string>,
): DecorationSet {
  if (fragments.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const needles = fragments.map((f) => f.trim()).filter((f) => f.length >= 2);

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    for (const needle of needles) {
      let idx = text.indexOf(needle);
      while (idx !== -1) {
        const from = pos + idx;
        const to = from + needle.length;
        decorations.push(
          Decoration.inline(from, to, { class: HIGHLIGHT_CLASS }),
        );
        idx = text.indexOf(needle, idx + needle.length);
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * The plugin. Subscribes to the highlight store and recomputes decorations
 * whenever the armed fragments change for this `documentType`, or the doc
 * changes (positions remap). A meta dispatch triggers the recompute.
 */
export function cesareHighlightPlugin(documentType: string): Plugin {
  return new Plugin<DecorationSet>({
    key: cesareHighlightKey,
    state: {
      init: (_config, state) =>
        buildDecorations(state.doc, getHighlightFragments(documentType)),
      apply(tr, value, _old, newState) {
        // Recompute on an explicit store-change meta, or when the doc changed
        // (so positions stay valid). Otherwise map the existing set forward.
        const armed = tr.getMeta(cesareHighlightKey) as
          | { fragments: ReadonlyArray<string> }
          | undefined;
        if (armed) {
          return buildDecorations(newState.doc, armed.fragments);
        }
        if (tr.docChanged) {
          return buildDecorations(
            newState.doc,
            getHighlightFragments(documentType),
          );
        }
        return value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return cesareHighlightKey.getState(state);
      },
    },
    view(view) {
      // Bridge the external store into the editor: on store change, dispatch a
      // meta-only transaction so `apply` rebuilds the decoration set.
      const unsubscribe = subscribeHighlight(() => {
        const fragments = getHighlightFragments(documentType);
        view.dispatch(view.state.tr.setMeta(cesareHighlightKey, { fragments }));
      });
      return {
        destroy: unsubscribe,
      };
    },
  });
}
