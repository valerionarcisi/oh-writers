import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const pluginKey = new PluginKey("sceneNumbers");

/**
 * Scene-numbers plugin.
 *
 * Walks the doc on every transaction, finds every `heading` node, and inserts
 * a left-gutter and right-gutter widget decoration at pos+1 (inside the heading
 * node, before the text). This places the widget inside the rendered <h2> so
 * that `position: absolute` on the span is relative to the heading line, not
 * to the page shell.
 *
 * pos+1 = first position inside the node (after the opening token).
 * side: -1 = widget renders before any text at that position.
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
        const label = String(sceneIndex);
        // pos+1: inside the heading node, before its text content.
        const insidePos = pos + 1;

        decos.push(
          Decoration.widget(insidePos, () => buildGutterWidget(label, "left"), {
            side: -1,
            key: `scene-num-left-${pos}`,
          }),
          Decoration.widget(
            insidePos,
            () => buildGutterWidget(label, "right"),
            {
              side: -1,
              key: `scene-num-right-${pos}`,
            },
          ),
        );

        return false; // don't descend into heading children
      });

      return DecorationSet.create(state.doc, decos);
    },
  },
});

const buildGutterWidget = (label: string, side: "left" | "right"): Element => {
  const span = document.createElement("span");
  span.className = side === "left" ? "pm-scene-num-left" : "pm-scene-num-right";
  span.textContent = label;
  span.setAttribute("aria-hidden", "true");
  return span;
};

/**
 * Inject the gutter widget styles once. Using a data attribute for idempotency.
 *
 * The spans are positioned absolute inside the <h2 class="pm-heading">.
 * The heading itself is position: relative (set in prosemirror-styles.ts) so
 * the spans land on the correct line rather than relative to the page shell.
 */
export const injectSceneNumberStyles = (): void => {
  if (document.querySelector("[data-pm-scene-num-styles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-pm-scene-num-styles", "true");
  style.textContent = `
    .pm-scene-num-left,
    .pm-scene-num-right {
      position: absolute;
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      font-size: 10pt;
      line-height: inherit;
      color: #aaa;
      user-select: none;
      pointer-events: none;
      top: 0;
    }
    .pm-scene-num-left  { left:  -1in; }
    .pm-scene-num-right { right: -0.5in; }
  `;
  document.head.appendChild(style);
};
