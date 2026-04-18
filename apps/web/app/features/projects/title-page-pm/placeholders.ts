/*
 * Placeholder plugin for the title-page editor.
 *
 * Each of the 5 regions (title, centerBlock, footerLeft, footerCenter,
 * footerRight) shows a faded hint inside its first paragraph as long as
 * the region is empty. The hint is rendered as a Decoration so it never
 * enters the document — typing immediately replaces it without any
 * delete step, and it does not affect the JSON saved to the server.
 */

import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

const REGION_HINTS: Record<string, string> = {
  title: "Click or tab to set the title",
  centerBlock: "Author, Based on, Source material…",
  footerLeft: "Draft date",
  footerCenter: "Notes",
  footerRight: "Contact info",
};

const buildDecorations = (doc: PMNode): DecorationSet => {
  const decos: Decoration[] = [];

  doc.forEach((region, regionOffset) => {
    const hint = REGION_HINTS[region.type.name];
    if (!hint) return;

    const isTitle = region.type.name === "title";
    const isEmpty = isTitle
      ? region.content.size === 0
      : region.childCount === 1 && region.firstChild?.content.size === 0;

    if (!isEmpty) return;

    const innerStart = isTitle ? regionOffset + 1 : regionOffset + 2;

    decos.push(
      Decoration.widget(
        innerStart,
        () => {
          const span = document.createElement("span");
          span.className = "tp-placeholder";
          span.textContent = hint;
          span.setAttribute("aria-hidden", "true");
          return span;
        },
        { side: -1, key: `tp-placeholder-${region.type.name}` },
      ),
    );
  });

  return DecorationSet.create(doc, decos);
};

export const placeholdersPlugin = () =>
  new Plugin({
    state: {
      init: (_, state) => buildDecorations(state.doc),
      apply: (tr, old) =>
        tr.docChanged ? buildDecorations(tr.doc) : old.map(tr.mapping, tr.doc),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
