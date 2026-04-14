import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const pluginKey = new PluginKey("sceneNumbers");

/**
 * Scene-numbers plugin.
 *
 * On every transaction:
 *   1. Walk the doc finding every `heading` node
 *   2. Insert a left-gutter and right-gutter widget decoration alongside it
 *
 * The scene number is derived from position in the doc (heading order), not
 * from the node's `number` attr — keeping this plugin stateless and simple.
 * Attrs are reserved for export (PDF, Fountain) where a stable number per
 * heading is needed; here we just count on the fly.
 *
 * Widgets are `<span>` elements positioned absolutely via CSS classes defined
 * in prosemirror.module.css. The page card (`pageShell`) must be
 * `position: relative` for the absolute positioning to work.
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

        decos.push(
          Decoration.widget(pos, () => buildGutterWidget(label, "left"), {
            side: -1,
            key: `scene-num-left-${pos}`,
          }),
          Decoration.widget(pos, () => buildGutterWidget(label, "right"), {
            side: -1,
            key: `scene-num-right-${pos}`,
          }),
        );

        return false; // don't descend into heading children
      });

      return DecorationSet.create(state.doc, decos);
    },
  },
});

const buildGutterWidget = (label: string, side: "left" | "right"): Element => {
  const span = document.createElement("span");
  // CSS classes are global (injected via a <style> tag) because PM widgets
  // live outside the CSS Module scope.
  span.className = side === "left" ? "pm-scene-num-left" : "pm-scene-num-right";
  span.textContent = label;
  span.setAttribute("aria-hidden", "true");
  return span;
};

/**
 * Inject the gutter widget styles once. Using a data attribute for idempotency
 * — same pattern as fountain-page-breaks.ts.
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
      line-height: 1;
      color: #aaa;
      user-select: none;
      pointer-events: none;
      top: 0;
    }
    .pm-scene-num-left  { left:  0.5in; }
    .pm-scene-num-right { right: 0.5in; }
  `;
  document.head.appendChild(style);
};
