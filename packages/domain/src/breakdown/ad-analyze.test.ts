import { describe, it, expect } from "vitest";
import {
  adAnalyze,
  type AdAnalyzeInput,
  type AdAnalyzeOccurrence,
  type AdAnalyzeScene,
} from "./ad-analyze.js";

const makeScene = (
  override: Partial<AdAnalyzeScene> & { id: string; number: number },
): AdAnalyzeScene => ({
  intExt: "INT",
  location: "BAR",
  timeOfDay: "GIORNO",
  pageCount: 1,
  storyDay: null,
  ...override,
});

const makeOcc = (
  override: Partial<AdAnalyzeOccurrence> &
    Pick<AdAnalyzeOccurrence, "sceneId" | "elementId" | "category" | "elementName">,
): AdAnalyzeOccurrence => ({
  quantity: 1,
  ...override,
});

describe("adAnalyze — continuity: same-day location jump", () => {
  it("flags the same character in two locations on the same story day", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({ id: "s1", number: 1, location: "BAR ROMA", storyDay: 1 }),
        makeScene({
          id: "s2",
          number: 2,
          location: "OSPEDALE",
          storyDay: 1,
        }),
      ],
      occurrences: [
        makeOcc({
          elementId: "e-luca",
          elementName: "LUCA",
          category: "cast",
          sceneId: "s1",
        }),
        makeOcc({
          elementId: "e-luca",
          elementName: "LUCA",
          category: "cast",
          sceneId: "s2",
        }),
      ],
    };
    const out = adAnalyze(input);
    const continuity = out.filter((s) => s.kind === "continuity");
    expect(continuity).toHaveLength(1);
    expect(continuity[0]?.title).toContain("LUCA");
    expect(continuity[0]?.severity).toBe("warn");
  });

  it("does not flag when story day is unknown", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({ id: "s1", number: 1, location: "BAR" }),
        makeScene({ id: "s2", number: 2, location: "OSPEDALE" }),
      ],
      occurrences: [
        makeOcc({
          elementId: "e-luca",
          elementName: "LUCA",
          category: "cast",
          sceneId: "s1",
        }),
        makeOcc({
          elementId: "e-luca",
          elementName: "LUCA",
          category: "cast",
          sceneId: "s2",
        }),
      ],
    };
    expect(
      adAnalyze(input).filter((s) => s.id.startsWith("continuity-day-jump")),
    ).toHaveLength(0);
  });
});

describe("adAnalyze — continuity: character disappearance", () => {
  it("flags a >15-scene gap between two appearances", () => {
    const scenes: AdAnalyzeScene[] = [];
    for (let i = 1; i <= 25; i++) {
      scenes.push(makeScene({ id: `s${i}`, number: i }));
    }
    const input: AdAnalyzeInput = {
      scenes,
      occurrences: [
        makeOcc({
          elementId: "e-maria",
          elementName: "MARIA",
          category: "cast",
          sceneId: "s1",
        }),
        makeOcc({
          elementId: "e-maria",
          elementName: "MARIA",
          category: "cast",
          sceneId: "s25",
        }),
      ],
    };
    const out = adAnalyze(input).filter(
      (s) => s.id === "continuity-disappearance-e-maria",
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain("23"); // 23 consecutive scenes missing
  });

  it("does not flag short gaps", () => {
    const scenes: AdAnalyzeScene[] = [];
    for (let i = 1; i <= 10; i++) {
      scenes.push(makeScene({ id: `s${i}`, number: i }));
    }
    const input: AdAnalyzeInput = {
      scenes,
      occurrences: [
        makeOcc({
          elementId: "e-x",
          elementName: "X",
          category: "cast",
          sceneId: "s1",
        }),
        makeOcc({
          elementId: "e-x",
          elementName: "X",
          category: "cast",
          sceneId: "s5",
        }),
      ],
    };
    expect(
      adAnalyze(input).filter((s) => s.kind === "continuity"),
    ).toHaveLength(0);
  });
});

describe("adAnalyze — risk: large extras count", () => {
  it("flags scenes with >20 extras and escalates beyond 50", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({ id: "s1", number: 1, location: "PIAZZA" }),
        makeScene({ id: "s2", number: 2, location: "STADIO" }),
      ],
      occurrences: [
        makeOcc({
          elementId: "e-folla1",
          elementName: "Folla",
          category: "extras",
          sceneId: "s1",
          quantity: 25,
        }),
        makeOcc({
          elementId: "e-folla2",
          elementName: "Tifosi",
          category: "extras",
          sceneId: "s2",
          quantity: 80,
        }),
      ],
    };
    const out = adAnalyze(input).filter((s) => s.id.startsWith("risk-extras-"));
    expect(out).toHaveLength(2);
    const s1 = out.find((s) => s.sceneNumber === 1);
    const s2 = out.find((s) => s.sceneNumber === 2);
    expect(s1?.severity).toBe("warn");
    expect(s2?.severity).toBe("critical");
  });
});

describe("adAnalyze — risk: long exterior night", () => {
  it("flags an exterior night scene over 5 pages", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({
          id: "s1",
          number: 1,
          intExt: "EXT",
          timeOfDay: "NOTTE",
          pageCount: 7,
        }),
      ],
      occurrences: [],
    };
    const out = adAnalyze(input).filter((s) =>
      s.id.startsWith("risk-night-ext-"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("warn");
  });

  it("does not flag short exterior night scenes", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({
          id: "s1",
          number: 1,
          intExt: "EXT",
          timeOfDay: "NOTTE",
          pageCount: 2,
        }),
      ],
      occurrences: [],
    };
    expect(
      adAnalyze(input).filter((s) => s.kind === "risk-flag"),
    ).toHaveLength(0);
  });
});

describe("adAnalyze — coverage gap", () => {
  it("flags a missing weapon when 'pistola' is in the text", () => {
    const screenplayText = `INT. BAR - GIORNO

Luca estrae una pistola e la punta verso Marco.
`;
    const input: AdAnalyzeInput = {
      scenes: [makeScene({ id: "s1", number: 1, location: "BAR" })],
      occurrences: [
        makeOcc({
          elementId: "e-luca",
          elementName: "LUCA",
          category: "cast",
          sceneId: "s1",
        }),
      ],
      screenplayText,
    };
    const out = adAnalyze(input).filter((s) => s.kind === "coverage-gap");
    expect(out.length).toBeGreaterThanOrEqual(1);
    const weapon = out.find((s) => s.title.includes("arma"));
    expect(weapon).toBeDefined();
    expect(weapon?.severity).toBe("critical");
    expect(weapon?.suggestedAction).toContain("Spogliare");
    expect(weapon?.category).toBe("props");
  });

  it("does not flag when the element is already in breakdown", () => {
    const screenplayText = `INT. BAR - GIORNO\n\nLuca estrae una pistola.\n`;
    const input: AdAnalyzeInput = {
      scenes: [makeScene({ id: "s1", number: 1, location: "BAR" })],
      occurrences: [
        makeOcc({
          elementId: "e-pistola",
          elementName: "Pistola",
          category: "props",
          sceneId: "s1",
        }),
      ],
      screenplayText,
    };
    expect(
      adAnalyze(input).filter((s) => s.title.includes("arma")),
    ).toHaveLength(0);
  });

  it("flags minorenne with critical severity", () => {
    const screenplayText = `INT. CASA - GIORNO\n\nUn bambino corre.\n`;
    const input: AdAnalyzeInput = {
      scenes: [makeScene({ id: "s1", number: 1, location: "CASA" })],
      occurrences: [],
      screenplayText,
    };
    const out = adAnalyze(input).filter((s) =>
      s.title.includes("minorenne"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("critical");
  });
});

describe("adAnalyze — location consolidation", () => {
  it("flags rare locations used in fewer than 3 scenes", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({ id: "s1", number: 1, location: "TETTO" }),
        makeScene({ id: "s2", number: 2, location: "CANTINA" }),
        makeScene({ id: "s3", number: 3, location: "CANTINA" }),
      ],
      occurrences: [],
    };
    const rare = adAnalyze(input).filter((s) => s.id.startsWith("loc-rare-"));
    // TETTO appears once, CANTINA appears twice → both <3
    expect(rare.length).toBeGreaterThanOrEqual(2);
  });

  it("flags alias locations (same normalized name, different raw form)", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({ id: "s1", number: 1, location: "BAR ROMA" }),
        makeScene({ id: "s2", number: 2, location: "Bar Roma" }),
        makeScene({ id: "s3", number: 3, location: "BAR  ROMA" }),
      ],
      occurrences: [],
    };
    const alias = adAnalyze(input).filter((s) => s.id.startsWith("loc-alias-"));
    expect(alias).toHaveLength(1);
    expect(alias[0]?.severity).toBe("warn");
  });
});

describe("adAnalyze — sorting", () => {
  it("sorts critical before warn before info, then by scene number", () => {
    const input: AdAnalyzeInput = {
      scenes: [
        makeScene({
          id: "s1",
          number: 1,
          intExt: "EXT",
          timeOfDay: "NOTTE",
          pageCount: 8,
        }),
        makeScene({ id: "s2", number: 2, location: "PIAZZA" }),
      ],
      occurrences: [
        makeOcc({
          elementId: "e1",
          elementName: "Folla",
          category: "extras",
          sceneId: "s2",
          quantity: 60,
        }),
      ],
    };
    const out = adAnalyze(input);
    expect(out.length).toBeGreaterThanOrEqual(2);
    // First must be critical (60 extras), then warn (long ext night).
    expect(out[0]?.severity).toBe("critical");
  });
});

describe("adAnalyze — empty input", () => {
  it("returns an empty array when there are no scenes", () => {
    expect(adAnalyze({ scenes: [], occurrences: [] })).toEqual([]);
  });
});
