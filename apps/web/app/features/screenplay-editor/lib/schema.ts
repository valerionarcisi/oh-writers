import { Schema } from "prosemirror-model";

export const schema = new Schema({
  nodes: {
    // Root — must contain at least one scene or a top-level transition (e.g. FADE IN:).
    doc: { content: "(scene | transition)+" },

    // Groups a scene heading with its body blocks. `defining: true` keeps
    // cut/paste from merging adjacent scenes into one.
    scene: {
      content: "heading body*",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "section.pm-scene" }],
      toDOM: () => ["section", { class: "pm-scene" }, 0],
    },

    // The INT./EXT. line. `number` attr is written by the scene-numbers plugin
    // and used by PDF export — it is never part of the editable text.
    heading: {
      content: "text*",
      attrs: { number: { default: null } },
      parseDOM: [{ tag: "h2.pm-heading" }],
      toDOM: (node) => [
        "h2",
        {
          class: "pm-heading",
          "data-number": node.attrs.number ?? "",
        },
        0,
      ],
    },

    // Free-form description paragraph — full width, no indent.
    action: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-action" }],
      toDOM: () => ["p", { class: "pm-action" }, 0],
    },

    // Speaker name — offset ~3.7" from page left, always uppercase via CSS.
    character: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-character" }],
      toDOM: () => ["p", { class: "pm-character" }, 0],
    },

    // Stage direction in parentheses, e.g. "(quietly)" — indented, italic via CSS.
    parenthetical: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-parenthetical" }],
      toDOM: () => ["p", { class: "pm-parenthetical" }, 0],
    },

    // Spoken words — narrow column (3.5" wide) offset 1" from margin.
    dialogue: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-dialogue" }],
      toDOM: () => ["p", { class: "pm-dialogue" }, 0],
    },

    // CUT TO:, FADE OUT. etc. — flush right, uppercase via CSS.
    // Also used as a top-level node for transitions outside a scene (e.g. FADE IN:).
    transition: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-transition" }],
      toDOM: () => ["p", { class: "pm-transition" }, 0],
    },

    // Leaf inline node — required by PM for all text content.
    text: { group: "inline" },
  },

  marks: {
    // Standard Fountain inline emphasis — all three map to their HTML equivalents.
    strong: {
      parseDOM: [{ tag: "strong" }],
      toDOM: () => ["strong", 0],
    },
    em: {
      parseDOM: [{ tag: "em" }],
      toDOM: () => ["em", 0],
    },
    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM: () => ["u", 0],
    },
  },
});

export type SchemaNodeType = keyof (typeof schema)["nodes"];
