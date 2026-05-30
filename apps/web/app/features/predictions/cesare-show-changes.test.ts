// apps/web/app/features/predictions/cesare-show-changes.test.ts
//
// Spec 47-A6 — unit coverage for the pure "Mostra modifiche" branch decision
// and the page → target-page mapping used by the split-drawer branch.

import { describe, it, expect } from "vitest";
import {
  decideShowChangesSurface,
  buildTargetPageRef,
} from "./cesare-show-changes";
import type { CesarePage } from "./components/CesareSheet";

describe("decideShowChangesSurface", () => {
  it("floating + expanded → inline live diff (doc visible behind chat)", () => {
    expect(
      decideShowChangesSurface({
        surface: "floating",
        drawerState: "expanded",
      }),
    ).toEqual({ _tag: "live-diff" });
  });

  it("floating + peek → inline live diff (doc still visible)", () => {
    expect(
      decideShowChangesSurface({ surface: "floating", drawerState: "peek" }),
    ).toEqual({ _tag: "live-diff" });
  });

  it("floating + expanded-split → inline live diff (resize state)", () => {
    expect(
      decideShowChangesSurface({
        surface: "floating",
        drawerState: "expanded-split",
      }),
    ).toEqual({ _tag: "live-diff" });
  });

  it("floating + full → split drawer (full panel covers the doc)", () => {
    expect(
      decideShowChangesSurface({ surface: "floating", drawerState: "full" }),
    ).toEqual({ _tag: "split-drawer" });
  });

  it("split lane → split drawer regardless of drawer state", () => {
    for (const drawerState of [
      "closed",
      "peek",
      "expanded",
      "expanded-split",
      "full",
    ] as const) {
      expect(
        decideShowChangesSurface({ surface: "split", drawerState }),
      ).toEqual({ _tag: "split-drawer" });
    }
  });
});

describe("buildTargetPageRef", () => {
  it("maps doc pages onto their IT preview kinds", () => {
    const cases: ReadonlyArray<[CesarePage, string]> = [
      ["soggetto", "soggetto"],
      ["synopsis", "sinossi"],
      ["outline", "scaletta"],
      ["treatment", "trattamento"],
    ];
    for (const [page, kind] of cases) {
      const ref = buildTargetPageRef(page);
      expect(ref).not.toBeNull();
      expect(ref!.kind).toBe(kind);
      expect(ref!.title).toBeTruthy();
    }
  });

  it("keeps the screenplay / breakdown / budget / locations kinds 1:1", () => {
    for (const page of [
      "screenplay",
      "breakdown",
      "budget",
      "locations",
    ] as const) {
      expect(buildTargetPageRef(page)?.kind).toBe(page);
    }
  });

  it("threads an optional scope into the ref", () => {
    expect(buildTargetPageRef("screenplay", "Sc.2")?.scope).toBe("Sc.2");
    // No scope → undefined, never an empty string.
    expect(buildTargetPageRef("screenplay")?.scope).toBeUndefined();
  });

  it("returns null for pages without a diff preview (schedule, shooting-plan)", () => {
    expect(buildTargetPageRef("schedule")).toBeNull();
    expect(buildTargetPageRef("shooting-plan")).toBeNull();
  });
});
