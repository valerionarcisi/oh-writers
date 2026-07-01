// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { fountainToDoc } from "../fountain-to-doc";
import {
  buildCesarePendingEditPlugin,
  startPendingEdit,
  findSceneRange,
} from "./cesare-pending-edit";

// Minimal EditorView shim: startPendingEdit only touches state.doc, state.tr,
// and dispatch. A real EditorView needs a DOM mount we don't want here.
const makeView = (doc: PMNode) => {
  let state = EditorState.create({
    doc,
    plugins: [
      buildCesarePendingEditPlugin({ onAccept: () => {}, onReject: () => {} }),
    ],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: ReturnType<typeof state.tr.replaceWith>) {
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  return {
    view,
    getState: () => state,
  };
};

// Collect the displayed scene_number attr of every heading, in doc order.
const headingNumbers = (doc: PMNode): string[] => {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "heading") {
      out.push((node.attrs["scene_number"] as string) ?? "");
      return false;
    }
    return true;
  });
  return out;
};

const THREE_SCENES = [
  "INT. CUCINA - GIORNO",
  "",
  "Giulio beve un caffè.",
  "",
  "INT. SALOTTO - GIORNO",
  "",
  "Giulio si siede.",
  "",
  "EXT. STRADA - NOTTE",
  "",
  "Giulio cammina.",
].join("\n");

describe("startPendingEdit — N2 scene-number preservation", () => {
  it("keeps 1,2,3 when scene 2 is rewritten (no 1,1,3 regression)", () => {
    const doc = fountainToDoc(THREE_SCENES);
    expect(headingNumbers(doc)).toEqual(["1", "2", "3"]);

    const { view, getState } = makeView(doc);
    const applied = startPendingEdit(
      view,
      2,
      "INT. SALOTTO - GIORNO\n\nGiulio si alza di scatto.",
    );

    expect(applied).toBe(true);
    expect(headingNumbers(getState().doc)).toEqual(["1", "2", "3"]);
  });

  it("preserves a locked non-sequential label (5A) on the rewritten scene", () => {
    // Build a doc whose 2nd scene carries a locked "5A" label, as a resequenced
    // shooting script would.
    const base = fountainToDoc(THREE_SCENES);
    const range = findSceneRange(base, 2)!;
    const heading = base.nodeAt(range.from)!.firstChild!;
    // The heading is the scene's first child → its pos is sceneStart + 1.
    const tr = EditorState.create({ doc: base }).tr.setNodeMarkup(
      range.from + 1,
      undefined,
      {
        ...heading.attrs,
        scene_number: "5A",
        scene_number_locked: true,
      },
    );
    const doc = tr.doc;
    expect(headingNumbers(doc)).toEqual(["1", "5A", "3"]);

    const { view, getState } = makeView(doc);
    const applied = startPendingEdit(
      view,
      2,
      "INT. SALOTTO - GIORNO\n\nGiulio si alza di scatto.",
    );

    expect(applied).toBe(true);
    expect(headingNumbers(getState().doc)).toEqual(["1", "5A", "3"]);
    // Locked flag survives too.
    const rewritten = findSceneRange(getState().doc, 2)!;
    const rewrittenHeading = getState().doc.nodeAt(rewritten.from)!.firstChild!;
    expect(rewrittenHeading.attrs["scene_number_locked"]).toBe(true);
  });

  it("resolves the right scene when the doc opens with stray action (no off-by-one)", () => {
    // Action before the first slugline → fountainToDoc wraps it in a synthetic
    // empty-heading scene. findSceneRange must NOT count it, so rewrite_scene(1)
    // still hits the FIRST real slugline, matching the server's ordinal.
    const withLead = ["Buio.", "", THREE_SCENES].join("\n");
    const doc = fountainToDoc(withLead);
    // The synthetic lead has an empty heading; the three real scenes carry 1,2,3.
    expect(headingNumbers(doc)).toEqual(["", "1", "2", "3"]);

    const { view, getState } = makeView(doc);
    const applied = startPendingEdit(
      view,
      1,
      "INT. CUCINA - GIORNO\n\nGiulio rovescia il caffè.",
    );
    expect(applied).toBe(true);

    // Scene "1" (the first real slugline, not the synthetic lead) was rewritten
    // and keeps its number; the synthetic lead is untouched.
    expect(headingNumbers(getState().doc)).toEqual(["", "1", "2", "3"]);
    const first = findSceneRange(getState().doc, 1)!;
    expect(getState().doc.nodeAt(first.from)!.textContent).toContain(
      "rovescia il caffè",
    );
  });

  it("respects a forced number the model emits (#7#) instead of reverting it", () => {
    const doc = fountainToDoc(THREE_SCENES);
    const { view, getState } = makeView(doc);
    const applied = startPendingEdit(
      view,
      2,
      "INT. SALOTTO - GIORNO #7#\n\nGiulio si alza.",
    );
    expect(applied).toBe(true);
    // The explicit #7# wins — we do not silently restore "2".
    expect(headingNumbers(getState().doc)).toEqual(["1", "7", "3"]);
  });
});
