import { Schema } from "prosemirror-model";

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

const baseNodes = {
  doc: { content: "block+" },
  paragraph: {
    group: "block",
    content: "inline*",
    parseDOM: [{ tag: "p" }],
    toDOM: () => ["p", 0] as const,
  },
  text: { group: "inline" },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"] as const,
  },
} as const;

const headingNode = {
  group: "block",
  content: "inline*",
  defining: true,
  attrs: { level: { default: 2 } },
  parseDOM: [
    { tag: "h2", attrs: { level: 2 } },
    { tag: "h3", attrs: { level: 3 } },
  ],
  toDOM: (node: { attrs: { level: number } }) =>
    [`h${node.attrs.level}`, 0] as const,
} as const;

const listNodes = {
  bullet_list: {
    group: "block",
    content: "list_item+",
    parseDOM: [{ tag: "ul" }],
    toDOM: () => ["ul", 0] as const,
  },
  list_item: {
    content: "paragraph block*",
    defining: true,
    parseDOM: [{ tag: "li" }],
    toDOM: () => ["li", 0] as const,
  },
} as const;

export const synopsisSchema = new Schema({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: baseNodes as any,
});

export const treatmentSchema = new Schema({
  nodes: {
    ...baseNodes,
    heading: headingNode,
    ...listNodes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});

export const getNarrativeSchema = (enableHeadings: boolean): Schema =>
  enableHeadings ? treatmentSchema : synopsisSchema;
