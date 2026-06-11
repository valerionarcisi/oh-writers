// BUG-N64 — fail-closed arbitration of the routed auxiliary surfaces.
import { describe, expect, it } from "vitest";
import {
  arbitrateRoutedSurfaces,
  CESARE_PEEK_PARAMS,
  VERSIONS_SURFACE_PARAMS,
} from "./routed-surface-arbitration";

describe("arbitrateRoutedSurfaces", () => {
  it("versions wins when both surfaces claim the slot — peek params stripped", () => {
    const result = arbitrateRoutedSurfaces({
      versionsOpen: true,
      cesarePeekOpen: true,
    });
    expect(result.winner).toBe("versions");
    expect(result.paramsToStrip).toEqual([...CESARE_PEEK_PARAMS]);
  });

  it("versions alone wins with nothing to strip", () => {
    const result = arbitrateRoutedSurfaces({
      versionsOpen: true,
      cesarePeekOpen: false,
    });
    expect(result.winner).toBe("versions");
    expect(result.paramsToStrip).toEqual([]);
  });

  it("cesare peek alone wins with nothing to strip", () => {
    const result = arbitrateRoutedSurfaces({
      versionsOpen: false,
      cesarePeekOpen: true,
    });
    expect(result.winner).toBe("cesare-peek");
    expect(result.paramsToStrip).toEqual([]);
  });

  it("no claims → no winner, nothing to strip", () => {
    const result = arbitrateRoutedSurfaces({
      versionsOpen: false,
      cesarePeekOpen: false,
    });
    expect(result.winner).toBeNull();
    expect(result.paramsToStrip).toEqual([]);
  });

  it("the param catalogues cover every routed-surface search param", () => {
    // Pins the contract: openers strip exactly these on cross-open, and the
    // URL normalisation strips exactly these from the loser.
    expect(CESARE_PEEK_PARAMS).toEqual(["peek"]);
    expect(VERSIONS_SURFACE_PARAMS).toEqual([
      "versions",
      "vstate",
      "vcur",
      "vkind",
    ]);
  });
});
