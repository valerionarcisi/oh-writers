import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node } from "prosemirror-model";

const pluginKey = new PluginKey("paginator");

/**
 * Physical page constants — industry standard US Letter screenplay format.
 * Values intentionally not CSS variables: they are fixed spec numbers.
 *
 * At 96 dpi: 1in = 96px
 * Printable area per page = 11in - 1in top - 1in bottom = 9in = 864px
 */
const PAGE_HEIGHT_PX = 11 * 96; // 1056px — full US Letter at 96dpi
const BOTTOM_MARGIN_PX = 1 * 96; // 96px
const PRINTABLE_HEIGHT_PX = PAGE_HEIGHT_PX - BOTTOM_MARGIN_PX; // 960px

/**
 * Collect the document positions of every top-level block inside the editor.
 * We only care about direct children of the PM root (scene, transition) and
 * their direct block children (heading, action, character, …).
 */
const collectBlockPositions = (doc: Node): number[] => {
  const positions: number[] = [];

  doc.forEach((topNode, topOffset) => {
    if (topNode.type.name === "scene") {
      topNode.forEach((child, childOffset) => {
        positions.push(topOffset + 1 + childOffset);
      });
    } else {
      // top-level transition
      positions.push(topOffset);
    }
  });

  return positions;
};

/**
 * Build page-break widget decorations by measuring the rendered position of
 * every block in the view and inserting a break widget before the first block
 * that crosses a page boundary.
 *
 * Returns an empty DecorationSet when called outside a browser context (SSR)
 * or before the view has rendered.
 */
const buildPageBreaks = (view: EditorView): DecorationSet => {
  if (typeof document === "undefined") return DecorationSet.empty;

  const editorDom = view.dom;
  const editorTop = editorDom.getBoundingClientRect().top + window.scrollY;

  const positions = collectBlockPositions(view.state.doc);
  const decos: Decoration[] = [];

  // Track which page boundary we're checking next (1-indexed page count)
  let nextPageBottom = PRINTABLE_HEIGHT_PX;

  for (const pos of positions) {
    let coords: { top: number; bottom: number };
    try {
      coords = view.coordsAtPos(pos);
    } catch {
      continue;
    }

    // Convert viewport-relative coords to doc-relative (scroll-independent)
    const blockTop = coords.top + window.scrollY - editorTop;
    const blockBottom = coords.bottom + window.scrollY - editorTop;

    // If the bottom of this block crosses the current page boundary, insert
    // a page break widget before it and advance to the next page boundary.
    while (blockBottom > nextPageBottom) {
      decos.push(
        Decoration.widget(pos, buildPageBreakWidget, {
          side: -1,
          key: `page-break-${nextPageBottom}`,
        }),
      );
      nextPageBottom += PRINTABLE_HEIGHT_PX;
    }
  }

  return DecorationSet.create(view.state.doc, decos);
};

const buildPageBreakWidget = (): Element => {
  const div = document.createElement("div");
  div.className = "pm-page-break";
  div.setAttribute("aria-hidden", "true");
  div.setAttribute("contenteditable", "false");
  return div;
};

/**
 * Inject the page-break widget styles once. Same idempotency pattern as
 * prosemirror-styles.ts.
 */
export const injectPaginatorStyles = (): void => {
  if (document.querySelector("[data-pm-paginator-styles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-pm-paginator-styles", "true");
  style.textContent = `
    /*
     * Screen rendering: a thin horizontal line flush with the page margins,
     * with the page number on the right. Keeps the single-page illusion while
     * signalling the boundary.
     *
     * PDF/print rendering: zero-height element with page-break-after: always,
     * letting print drivers split pages exactly there.
     */
    .pm-page-break {
      display: block;
      block-size: 0;
      margin-block: 1em;
      border-block-start: 1px dashed #d0cfcd;
      position: relative;
      user-select: none;
      pointer-events: none;
    }

    .pm-page-break::after {
      content: "";
      display: block;
      block-size: 0.5em;
    }

    @media print {
      .pm-page-break {
        display: block;
        block-size: 0;
        margin: 0;
        border: none;
        page-break-after: always;
      }
    }
  `;
  document.head.appendChild(style);
};

/**
 * Paginator plugin.
 *
 * Recomputes page-break decorations after every transaction that changes the
 * document. The computation is deferred via requestAnimationFrame so that PM
 * has painted the new DOM before we measure coordsAtPos.
 *
 * Phase 6 ships page-break widgets only — no MORE/CONT'D carry-over
 * (spec 05f v1 fallback; to be added in Phase 9).
 */
export const buildPaginatorPlugin = () => {
  let decorations = DecorationSet.empty;
  let rafId: number | null = null;

  return new Plugin({
    key: pluginKey,

    view(initialView) {
      // Compute initial page breaks after the first paint
      rafId = requestAnimationFrame(() => {
        decorations = buildPageBreaks(initialView);
        // Force a state update so the decorations are applied
        initialView.dispatch(initialView.state.tr.setMeta(pluginKey, "init"));
      });

      return {
        update(view, prevState) {
          if (!view.state.doc.eq(prevState.doc)) {
            // Doc changed — recompute after paint
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              decorations = buildPageBreaks(view);
              view.dispatch(view.state.tr.setMeta(pluginKey, "recompute"));
            });
          }
        },
        destroy() {
          if (rafId !== null) cancelAnimationFrame(rafId);
        },
      };
    },

    props: {
      decorations() {
        return decorations;
      },
    },
  });
};
