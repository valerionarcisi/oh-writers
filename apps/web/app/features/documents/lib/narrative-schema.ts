import { Schema, type NodeSpec } from "prosemirror-model";

/**
 * Minimal ProseMirror schema for narrative documents (synopsis, treatment).
 *
 * No inline marks (bold/italic): the editor is intentionally plain at the
 * inline level — the only structure is at block level. See spec 04e.
 *
 * Two flavors are exposed via `enableHeadings`:
 *   - false (synopsis): only paragraphs (+ hard breaks)
 *   - true  (treatment): paragraphs + H2/H3 + bullet lists
 */

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
});

export const treatmentSchema = new Schema({
  nodes: {
    ...baseNodes,
    heading: headingNode,
    ...listNodes,
  },
});

export const getNarrativeSchema = (enableHeadings: boolean): Schema =>
  enableHeadings ? treatmentSchema : synopsisSchema;
