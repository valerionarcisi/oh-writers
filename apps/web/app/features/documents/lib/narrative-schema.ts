import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";

/**
 * Minimal ProseMirror schema for narrative documents (soggetto, synopsis,
 * treatment).
 *
 * Inline marks: bold (`strong`) + italic (`em`) — Spec 65. The structure stays
 * otherwise lean (block-level + these two marks). Marks round-trip to
 * `<strong>`/`<em>` so formatting persists on save.
 *
 * Two flavors are exposed via `enableHeadings`:
 *   - false (soggetto/synopsis): paragraphs (+ hard breaks) + marks
 *   - true  (treatment): paragraphs + H2/H3 + bullet lists + marks
 */

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b" },
      {
        style: "font-weight",
        getAttrs: (v) => /^(bold(er)?|[5-9]\d\d)$/.test(v as string) && null,
      },
    ],
    toDOM: () => ["strong", 0],
  },
  em: {
    parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    toDOM: () => ["em", 0],
  },
};

const baseNodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  paragraph: {
    group: "block",
    content: "inline*",
    parseDOM: [{ tag: "p" }],
    toDOM: () => ["p", 0],
  },
  text: { group: "inline" },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },
};

const headingNode: NodeSpec = {
  group: "block",
  content: "inline*",
  defining: true,
  attrs: { level: { default: 2 } },
  parseDOM: [
    { tag: "h2", attrs: { level: 2 } },
    { tag: "h3", attrs: { level: 3 } },
  ],
  toDOM: (node) => [`h${node.attrs["level"] as number}`, 0],
};

const listNodes: Record<string, NodeSpec> = {
  bullet_list: {
    group: "block",
    content: "list_item+",
    parseDOM: [{ tag: "ul" }],
    toDOM: () => ["ul", 0],
  },
  list_item: {
    content: "paragraph block*",
    defining: true,
    parseDOM: [{ tag: "li" }],
    toDOM: () => ["li", 0],
  },
};

export const synopsisSchema = new Schema({
  nodes: baseNodes,
  marks,
});

export const treatmentSchema = new Schema({
  nodes: {
    ...baseNodes,
    heading: headingNode,
    ...listNodes,
  },
  marks,
});

export const getNarrativeSchema = (enableHeadings: boolean): Schema =>
  enableHeadings ? treatmentSchema : synopsisSchema;
