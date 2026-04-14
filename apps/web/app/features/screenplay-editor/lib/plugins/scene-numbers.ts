import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const pluginKey = new PluginKey("sceneNumbers");

/**
 * Scene-numbers plugin.
 *
 * Uses Decoration.node to stamp a `data-number` attribute onto every heading
 * element on every transaction. Node decorations are re-applied by PM on every
 * render, so the attribute is always present — including on first mount.
 *
 * The numbers are rendered via CSS ::before / ::after pseudo-elements in
 * prosemirror-styles.ts. No widget decorations, no DOM insertion into the text
 * flow, no selection side-effects.
 */
export const sceneNumbersPlugin = new Plugin({
  key: pluginKey,

  props: {
    decorations(state) {
      const decos: Decoration[] = [];
      let sceneIndex = 0;

      state.doc.descendants((node, pos) => {
        if (node.type.name !== "heading") return true;

        sceneIndex += 1;

        // Decoration.node stamps extra attrs onto the rendered DOM element
        // without modifying the document model. PM re-applies these on every
        // render, so data-number is always present from the first paint.
        decos.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-number": String(sceneIndex),
          }),
        );

        return false;
      });

      return DecorationSet.create(state.doc, decos);
    },
  },
});

// No DOM injection needed — styles live in prosemirror-styles.ts.
export const injectSceneNumberStyles = (): void => {};
