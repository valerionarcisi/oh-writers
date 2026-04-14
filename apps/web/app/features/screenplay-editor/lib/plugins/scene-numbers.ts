import { Plugin, PluginKey } from "prosemirror-state";

const pluginKey = new PluginKey("sceneNumbers");

/**
 * Scene-numbers plugin.
 *
 * Keeps the `number` attr on every `heading` node in sync with its position
 * in the document (1-based, recomputed on every transaction where the order
 * changes). The attr is written to the DOM as `data-number` by the schema's
 * `toDOM`, and the gutter numbers are rendered via CSS `::before` / `::after`
 * pseudo-elements — no widget decorations, no DOM insertion, no selection
 * side-effects.
 *
 * CSS rules live in prosemirror-styles.ts under `.pm-heading[data-number]`.
 */
export const sceneNumbersPlugin = new Plugin({
  key: pluginKey,

  appendTransaction(transactions, _oldState, newState) {
    // Only recompute when the document actually changed.
    const docChanged = transactions.some((tr) => tr.docChanged);
    if (!docChanged) return null;

    const tr = newState.tr;
    let changed = false;
    let sceneIndex = 0;

    newState.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") return true;

      sceneIndex += 1;
      if (node.attrs.number !== sceneIndex) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          number: sceneIndex,
        });
        changed = true;
      }

      return false; // don't descend into heading children
    });

    return changed ? tr : null;
  },
});

// No styles to inject — scene number rendering is handled entirely by
// CSS pseudo-elements in prosemirror-styles.ts.
export const injectSceneNumberStyles = (): void => {};
