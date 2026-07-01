// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fountainToDoc } from "../fountain-to-doc";
import { findAllMatches, type ProposedEdit } from "./proposed-edit-decoration";

// Screenplay proposals are now only global renames (the per-scene find/replace
// edit path was retired with propose_screenplay_edit, spec 80). findAllMatches
// matches an entity name whole-word, case-insensitively, across the whole doc.
const renameProposal = (find: string): ProposedEdit => ({
  id: "r-1",
  kind: "rename_character",
  find,
  replace: "GIULIO",
  reason: "test",
  sceneNumber: null,
});

const SCENE = [
  "INT. CUCINA - GIORNO",
  "",
  "Al bancone Dante prepara il caffè. Poi Dante lo beve.",
].join("\n");

describe("findAllMatches — rename (whole-word, doc-wide)", () => {
  it("matches every occurrence of the entity name", () => {
    const doc = fountainToDoc(SCENE);
    const matches = findAllMatches(doc, renameProposal("Dante"));
    // Two "Dante" tokens in the action line (both preceded by a word boundary).
    expect(matches.length).toBe(2);
    expect(matches.every((m) => m.text === "Dante")).toBe(true);
  });

  it("does not match a substring inside a larger word", () => {
    const doc = fountainToDoc("INT. X - DAY\n\nUn Dantesco panorama davanti.");
    expect(findAllMatches(doc, renameProposal("Dante"))).toHaveLength(0);
  });
});
