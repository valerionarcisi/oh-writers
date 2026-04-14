import { Schema } from "prosemirror-model";

export const schema = new Schema({
  nodes: {
    doc: { content: "(scene | transition)+" },

    scene: {
      content: "heading body*",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "section.pm-scene" }],
      toDOM: () => ["section", { class: "pm-scene" }, 0],
    },

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

    action: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-action" }],
      toDOM: () => ["p", { class: "pm-action" }, 0],
    },

    character: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-character" }],
      toDOM: () => ["p", { class: "pm-character" }, 0],
    },

    parenthetical: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-parenthetical" }],
      toDOM: () => ["p", { class: "pm-parenthetical" }, 0],
    },

    dialogue: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-dialogue" }],
      toDOM: () => ["p", { class: "pm-dialogue" }, 0],
    },

    transition: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-transition" }],
      toDOM: () => ["p", { class: "pm-transition" }, 0],
    },

    text: { group: "inline" },
  },

  marks: {
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
