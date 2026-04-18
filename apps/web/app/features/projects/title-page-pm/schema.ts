import { Schema } from "prosemirror-model";

export const titlePageSchema = new Schema({
  nodes: {
    doc: {
      content: "title centerBlock footerLeft footerCenter footerRight",
    },
    title: {
      content: "text*",
      isolating: true,
      defining: true,
      parseDOM: [{ tag: "h1.tp-title" }],
      toDOM: () => ["h1", { class: "tp-title" }, 0],
    },
    centerBlock: {
      content: "para+",
      isolating: true,
      defining: true,
      parseDOM: [{ tag: "section.tp-center" }],
      toDOM: () => ["section", { class: "tp-center" }, 0],
    },
    footerLeft: {
      content: "para+",
      isolating: true,
      defining: true,
      parseDOM: [{ tag: "section.tp-footer-left" }],
      toDOM: () => ["section", { class: "tp-footer-left" }, 0],
    },
    footerCenter: {
      content: "para+",
      isolating: true,
      defining: true,
      parseDOM: [{ tag: "section.tp-footer-center" }],
      toDOM: () => ["section", { class: "tp-footer-center" }, 0],
    },
    footerRight: {
      content: "para+",
      isolating: true,
      defining: true,
      parseDOM: [{ tag: "section.tp-footer-right" }],
      toDOM: () => ["section", { class: "tp-footer-right" }, 0],
    },
    para: {
      content: "text*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
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
