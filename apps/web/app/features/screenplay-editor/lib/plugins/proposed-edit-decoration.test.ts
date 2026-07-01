// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { fountainToDoc } from "../fountain-to-doc";
import { findSceneRange } from "./cesare-pending-edit";
import { findAllMatches, type ProposedEdit } from "./proposed-edit-decoration";

// The exact same action line appears in BOTH scenes, so a doc-wide `find` would
// decorate the wrong one. Scoping by scene_number must land only in the target.
const TWO_SCENES = [
  "INT. CUCINA - GIORNO",
  "",
  "Non se coce.",
  "",
  "INT. SALOTTO - NOTTE",
  "",
  "Non se coce.",
].join("\n");

const editProposal = (
  find: string,
  sceneNumber: number | null,
): ProposedEdit => ({
  id: "e-1",
  kind: "edit",
  find,
  replace: "Se coce.",
  reason: "test",
  sceneNumber,
});

// Which scene (1-based) a PM position falls in — used to assert the match
// landed in the intended scene.
const sceneOf = (doc: PMNode, pos: number): number => {
  for (let n = 1; ; n++) {
    const range = findSceneRange(doc, n);
    if (!range) return -1;
    if (pos >= range.from && pos < range.to) return n;
  }
};

describe("findAllMatches — #86 scene scoping for edit proposals", () => {
  it("decorates the match in the TARGET scene, not a look-alike elsewhere", () => {
    const doc = fountainToDoc(TWO_SCENES);

    const inScene2 = findAllMatches(doc, editProposal("Non se coce.", 2));
    expect(inScene2).toHaveLength(1);
    expect(sceneOf(doc, inScene2[0]!.from)).toBe(2);

    const inScene1 = findAllMatches(doc, editProposal("Non se coce.", 1));
    expect(inScene1).toHaveLength(1);
    expect(sceneOf(doc, inScene1[0]!.from)).toBe(1);
  });

  it("decorates NOTHING when the find is absent from the named scene", () => {
    const doc = fountainToDoc(TWO_SCENES);
    // "Filippo" is in neither scene body.
    expect(findAllMatches(doc, editProposal("Filippo", 2))).toEqual([]);
  });

  it("falls back to doc-wide match when sceneNumber is null (rename-like edit)", () => {
    const doc = fountainToDoc(TWO_SCENES);
    const matches = findAllMatches(doc, editProposal("Non se coce.", null));
    // Unscoped edit finds the FIRST occurrence only (edit semantics), in scene 1.
    expect(matches).toHaveLength(1);
    expect(sceneOf(doc, matches[0]!.from)).toBe(1);
  });

  it("matches a find whose whitespace differs from the reflowed PM text", () => {
    // The model's anchor line as it appears in the indented Fountain vs the
    // reflowed PM doc: extra/collapsed spaces and a line break in the middle.
    // Exact indexOf would miss; the whitespace-tolerant path must still land it.
    const doc = fountainToDoc(
      ["INT. CUCINA - GIORNO", "", "Tea taglia il pane lentamente."].join("\n"),
    );
    const matches = findAllMatches(
      doc,
      editProposal("Tea taglia\n   il  pane   lentamente.", 1),
    );
    expect(matches).toHaveLength(1);
    expect(sceneOf(doc, matches[0]!.from)).toBe(1);
  });
});
