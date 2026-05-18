import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../schema";
import { tabCommand, enterCommand, fountainKeymap } from "./keymap";
import { setElement } from "../schema-commands";

const t = (text: string) => schema.text(text);

const node = (type: string, content: PMNode[] = []) =>
  schema.nodes[type]!.create(null, content);

// Headings now require two child nodes (`prefix` + `title`). For tests that
// don't care about the split, this builds a structurally valid heading from
// a single raw string by putting the whole thing in the title slot.
const heading = (raw: string) =>
  schema.nodes.heading!.create(null, [
    schema.nodes.prefix!.create(null, []),
    schema.nodes.title!.create(null, raw ? [t(raw)] : []),
  ]);

const buildDoc = (children: PMNode[]) =>
  schema.nodes.doc.create(null, children);

const stateAtBlock = (doc: PMNode, blockPath: number[], offset = 0) => {
  let pos = 0;
  let current: PMNode = doc;
  for (const i of blockPath) {
    pos += 1;
    for (let j = 0; j < i; j++) {
      pos += current.child(j).nodeSize;
    }
    current = current.child(i);
  }
  pos += offset;
  const state = EditorState.create({ doc });
  const sel = TextSelection.near(state.doc.resolve(pos));
  return state.apply(state.tr.setSelection(sel));
};

const runCommand = (
  state: EditorState,
  cmd: (
    s: EditorState,
    d: (tr: ReturnType<EditorState["tr"]["insertText"]>) => void,
  ) => boolean,
): { ok: boolean; state: EditorState } => {
  let nextState = state;
  const ok = cmd(state, (tr) => {
    nextState = state.apply(tr);
  });
  return { ok, state: nextState };
};

describe("tabCommand", () => {
  it("empty dialogue → parenthetical with '()' and cursor between", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
        node("dialogue"),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 2]);
    const { ok, state: next } = runCommand(state, tabCommand);
    expect(ok).toBe(true);
    const paren = next.doc.firstChild!.child(2);
    expect(paren.type.name).toBe("parenthetical");
    expect(paren.textContent).toBe("()");
    const cursorPos = next.selection.from;
    const $p = next.doc.resolve(cursorPos);
    expect($p.parent.type.name).toBe("parenthetical");
    expect($p.parentOffset).toBe(1);
  });

  it("character → parenthetical (non-empty)", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 1], 1);
    const { ok, state: next } = runCommand(state, tabCommand);
    expect(ok).toBe(true);
    expect(next.doc.firstChild!.child(1).type.name).toBe("parenthetical");
  });

  it("non-empty dialogue → action (standard Tab matrix)", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
        node("dialogue", [t("Hello.")]),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 2], 1);
    const { ok, state: next } = runCommand(state, tabCommand);
    expect(ok).toBe(true);
    expect(next.doc.firstChild!.child(2).type.name).toBe("action");
  });
});

describe("enterCommand", () => {
  it("character → new dialogue block", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 1], 4);
    const { ok, state: next } = runCommand(state, enterCommand);
    expect(ok).toBe(true);
    const scene = next.doc.firstChild!;
    expect(scene.childCount).toBe(3);
    expect(scene.child(2).type.name).toBe("dialogue");
  });

  it("dialogue → new character block", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
        node("dialogue", [t("Hello.")]),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 2], 6);
    const { ok, state: next } = runCommand(state, enterCommand);
    expect(ok).toBe(true);
    expect(next.doc.firstChild!.child(3).type.name).toBe("character");
  });

  it("parenthetical → new dialogue block", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
        node("parenthetical", [t("(quietly)")]),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 2], 9);
    const { ok, state: next } = runCommand(state, enterCommand);
    expect(ok).toBe(true);
    expect(next.doc.firstChild!.child(3).type.name).toBe("dialogue");
  });

  it("empty dialogue → converts to action in place (double-Enter breakout)", () => {
    const doc = buildDoc([
      node("scene", [
        heading("INT. ROOM - DAY"),
        node("character", [t("ANNA")]),
        node("dialogue"),
      ]),
    ]);
    const state = stateAtBlock(doc, [0, 2]);
    const { ok, state: next } = runCommand(state, enterCommand);
    expect(ok).toBe(true);
    const scene = next.doc.firstChild!;
    expect(scene.childCount).toBe(3);
    expect(scene.child(2).type.name).toBe("action");
    expect(scene.child(2).textContent).toBe("");
  });

  it("empty character → converts to action in place", () => {
    const doc = buildDoc([
      node("scene", [heading("INT. ROOM - DAY"), node("character")]),
    ]);
    const state = stateAtBlock(doc, [0, 1]);
    const { ok, state: next } = runCommand(state, enterCommand);
    expect(ok).toBe(true);
    expect(next.doc.firstChild!.child(1).type.name).toBe("action");
  });

  it("heading → inserts action after heading (Strategy A)", () => {
    const doc = buildDoc([node("scene", [heading("INT. ROOM - DAY")])]);
    // Put the caret inside the title slot: doc → scene(0) → heading(0) →
    // title(1) → text at offset 5. stateAtBlock walks blockPath through
    // child indices; depth into `prefix` is child 0, `title` is child 1.
    const state = stateAtBlock(doc, [0, 0, 1], 5);
    const { ok, state: next } = runCommand(state, enterCommand);
    expect(ok).toBe(true);
    const scene = next.doc.firstChild!;
    expect(scene.childCount).toBe(2);
    expect(scene.child(0).type.name).toBe("heading");
    // title child preserves the original text
    expect(scene.child(0).lastChild!.textContent).toBe("INT. ROOM - DAY");
    expect(scene.child(1).type.name).toBe("action");
  });
});

// ─── Cmd+1-7 / Alt+letter element shortcuts ─────────────────────────────────

describe("setElement — Cmd+N / Alt+letter shortcuts (matrix verification)", () => {
  const elementOrder = [
    "scene",
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "transition",
  ] as const;

  it.each([
    ["action", "character"] as const,
    ["action", "dialogue"] as const,
    ["action", "parenthetical"] as const,
    ["action", "transition"] as const,
    ["character", "action"] as const,
    ["dialogue", "action"] as const,
    ["parenthetical", "action"] as const,
    ["transition", "action"] as const,
  ])("setElement converts %s → %s", (from, to) => {
    const doc = buildDoc([node("scene", [heading("INT. X - DAY"), node(from)])]);
    const state = stateAtBlock(doc, [0, 1], 0);
    const { ok, state: next } = runCommand(state, setElement(to));
    expect(ok).toBe(true);
    expect(next.doc.firstChild!.child(1).type.name).toBe(to);
  });

  // Verify all 6 element types covered by Cmd+1..6 / Alt+letter are addressable
  it("all 6 element types in ELEMENT_ORDER are valid ElementType values", () => {
    expect(elementOrder).toHaveLength(6);
    for (const el of elementOrder) {
      // setElement must return a truthy Command for each type
      expect(typeof setElement(el)).toBe("function");
    }
  });
});

// ─── Inline marks (⌘B / ⌘I / ⌘U) ───────────────────────────────────────────

describe("inline marks — bold, italic, underline", () => {
  // Verify marks are defined in the schema (pre-condition for the keymap handlers)
  it("schema has strong mark", () => {
    expect(schema.marks.strong).toBeDefined();
  });

  it("schema has em mark", () => {
    expect(schema.marks.em).toBeDefined();
  });

  it("schema has underline mark", () => {
    expect(schema.marks.underline).toBeDefined();
  });

  it("fountainKeymap is a Plugin (sanity check for export)", () => {
    // fountainKeymap is created by prosemirror-keymap — it has a `props` shape.
    expect(fountainKeymap).toBeDefined();
    expect(typeof fountainKeymap).toBe("object");
  });
});
