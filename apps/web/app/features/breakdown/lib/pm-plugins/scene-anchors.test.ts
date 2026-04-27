import { describe, it, expect } from "vitest";
import {
  screenplaySchema as schema,
  fountainToDoc,
} from "~/features/screenplay-editor";
import { findSceneNodePosition, findSceneIndexAtPos } from "./scene-anchors";

const SAMPLE = `INT. KITCHEN - DAY

Bob enters.

INT. GARAGE - NIGHT

Alice waits.
`;

describe("scene-anchors", () => {
  it("findSceneNodePosition returns pos of N-th heading (1-based)", () => {
    const doc = fountainToDoc(SAMPLE);
    const pos1 = findSceneNodePosition(doc, 1);
    const pos2 = findSceneNodePosition(doc, 2);
    expect(pos1).not.toBeNull();
    expect(pos2).not.toBeNull();
    expect(pos2!).toBeGreaterThan(pos1!);
  });

  it("findSceneNodePosition returns null when index is out of range", () => {
    const doc = fountainToDoc(SAMPLE);
    expect(findSceneNodePosition(doc, 0)).toBeNull();
    expect(findSceneNodePosition(doc, 99)).toBeNull();
  });

  it("findSceneNodePosition returns null on a doc with no headings", () => {
    // schema requires (scene | transition)+ — use a top-level transition
    // (e.g. FADE IN:) which has no heading children
    const noHeadings = schema.node("doc", null, [
      schema.node("transition", null, schema.text("FADE IN:")),
    ]);
    expect(findSceneNodePosition(noHeadings, 1)).toBeNull();
  });

  it("findSceneIndexAtPos returns 1-based scene index containing pos", () => {
    const doc = fountainToDoc(SAMPLE);
    const pos2 = findSceneNodePosition(doc, 2)!;
    expect(findSceneIndexAtPos(doc, pos2)).toBe(2);
  });

  it("findSceneIndexAtPos returns null when pos is before first heading", () => {
    const doc = fountainToDoc(SAMPLE);
    expect(findSceneIndexAtPos(doc, 0)).toBeNull();
  });
});
