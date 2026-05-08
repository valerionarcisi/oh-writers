import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * Attaches data-testid="scene-N-heading" to each heading node so Playwright
 * tests can locate scene headings by index without coupling to text content.
 */
export function buildSceneTestidPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decos: Decoration[] = [];
        let index = 0;
        state.doc.descendants((node, pos) => {
          if (node.type.name === "heading") {
            index += 1;
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                "data-testid": `scene-${index}-heading`,
              }),
            );
            return false;
          }
          return true;
        });
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}
