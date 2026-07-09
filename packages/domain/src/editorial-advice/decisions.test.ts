import { describe, expect, it } from "vitest";
import {
  buildEditorialAdviceDecisionKey,
  buildEditorialAdviceDecisionsBlock,
} from "./decisions";

describe("buildEditorialAdviceDecisionKey", () => {
  it("anchors on snippet when present", () => {
    const key = buildEditorialAdviceDecisionKey(
      {
        area: "structure",
        title: "Svolta pentimento",
        snippet: "verso il pentimento",
        find: null,
      },
      { docType: "soggetto" },
    );
    expect(key).toEqual({
      docType: "soggetto",
      sceneId: null,
      area: "structure",
      anchorText: "verso il pentimento",
      titleFingerprint: "svolta pentimento",
    });
  });

  it("falls back to find, then empty string, when there is no snippet", () => {
    const withFind = buildEditorialAdviceDecisionKey(
      {
        area: "dialogue",
        title: "Battuta ridondante",
        snippet: null,
        find: "non voglio più",
      },
      {
        docType: "screenplay",
        sceneId: "11111111-1111-1111-1111-111111111111",
      },
    );
    expect(withFind.anchorText).toBe("non voglio più");
    expect(withFind.sceneId).toBe("11111111-1111-1111-1111-111111111111");

    const withNeither = buildEditorialAdviceDecisionKey(
      { area: "tone", title: "Apertura più lirica", snippet: null, find: null },
      { docType: "synopsis" },
    );
    expect(withNeither.anchorText).toBe("");
  });

  it("normalizes the title fingerprint (case, punctuation, whitespace)", () => {
    const key = buildEditorialAdviceDecisionKey(
      {
        area: "tone",
        title: "  Apertura, più lirica!  ",
        snippet: null,
        find: null,
      },
      { docType: "synopsis" },
    );
    expect(key.titleFingerprint).toBe("apertura più lirica");
  });
});

describe("buildEditorialAdviceDecisionsBlock", () => {
  it("returns an empty string when there are no decisions", () => {
    expect(buildEditorialAdviceDecisionsBlock([])).toBe("");
  });

  it("renders one line per decision with area, anchor and Italian status label", () => {
    const block = buildEditorialAdviceDecisionsBlock([
      {
        docType: "soggetto",
        sceneId: null,
        area: "structure",
        anchorText: "svolta pentimento",
        titleFingerprint: "snodo centrale",
        status: "authorial_choice",
      },
      {
        docType: "soggetto",
        sceneId: null,
        area: "tone",
        anchorText: "",
        titleFingerprint: "apertura più lirica",
        status: "ignored",
      },
    ]);
    expect(block).toContain("Note già decise dall'autore");
    expect(block).toContain(
      '- [structure] "svolta pentimento" → scelta autoriale',
    );
    expect(block).toContain('- [tone] nota "apertura più lirica" → ignorata');
  });
});
