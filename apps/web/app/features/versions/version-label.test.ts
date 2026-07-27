import { describe, it, expect } from "vitest";
import { versionDisplayLabel } from "./version-label";

// The real catalogue is exercised end-to-end; here the resolver's own branching
// is what matters, so `t` just echoes the key's Italian value.
const t = ((key: string) =>
  key === "versions.split.versionPrefix" ? "Versione" : key) as never;

describe("versionDisplayLabel", () => {
  it("keeps a user-chosen label verbatim", () => {
    expect(
      versionDisplayLabel(
        { number: 4, label: "il mio nome", kind: "manual" },
        t,
      ),
    ).toBe("il mio nome");
  });

  it("falls back to the number when a manual version has no label", () => {
    expect(
      versionDisplayLabel({ number: 3, label: null, kind: "manual" }, t),
    ).toBe("Versione 3");
  });

  it("treats a blank label as no label", () => {
    expect(
      versionDisplayLabel({ number: 2, label: "   ", kind: "manual" }, t),
    ).toBe("Versione 2");
  });

  // #55 — Cesare's internal label used to reach the TopBar chip and the Versions
  // lane, so a document the writer had just accepted still announced itself as
  // "DRAFT CESARE · SINOSSI".
  it("never surfaces Cesare's internal label on a working row", () => {
    expect(
      versionDisplayLabel(
        { number: 7, label: "draft Cesare · sinossi", kind: "working" },
        t,
      ),
    ).toBe("Versione 7");
  });

  it("never surfaces Cesare's internal label on a checkpoint row", () => {
    expect(
      versionDisplayLabel(
        {
          number: 6,
          label: "draft Cesare · soggetto · checkpoint",
          kind: "checkpoint",
        },
        t,
      ),
    ).toBe("Versione 6");
  });

  it("defaults to the label when the row carries no kind", () => {
    expect(versionDisplayLabel({ number: 1, label: "importata" }, t)).toBe(
      "importata",
    );
  });
});
