// apps/web/app/features/app-shell/use-unified-split-navigation.test.ts
//
// Unit tests for the pure history→URL reconciler that powers the unified
// navigable split host (Spec 78 A6). The reconciler decides — from the active
// shared-history payload + the live routed params — which single URL action
// keeps the one auxiliary track correct, with the routed params MUTUALLY
// EXCLUSIVE (never both `?peek` and `?versions` at once).

import { describe, it, expect } from "vitest";
import {
  reconcileUrlAction,
  type RoutedCesarePeekState,
  type RoutedVersionsState,
} from "./use-unified-split-navigation";
import type {
  SplitDrawerCesarePeekPayload,
  SplitDrawerVersionsPayload,
  SplitDrawerNotificationsPayload,
} from "./split-drawer-context";

const cesarePeekPayload: SplitDrawerCesarePeekPayload = { kind: "cesare-peek" };
const versionsPayload = (
  documentId: string,
  extra?: Partial<SplitDrawerVersionsPayload>,
): SplitDrawerVersionsPayload => ({
  kind: "versions",
  documentId,
  currentVersionId: extra?.currentVersionId ?? null,
  versionKind: extra?.versionKind ?? null,
});
const notificationsPayload: SplitDrawerNotificationsPayload = {
  kind: "notifications",
};

const noPeek: RoutedCesarePeekState = { isActive: false };
const peekActive: RoutedCesarePeekState = { isActive: true };
const noVersions: RoutedVersionsState = {
  documentId: null,
  currentVersionId: null,
  versionKind: null,
};
const versionsUrl = (
  documentId: string,
  extra?: Partial<RoutedVersionsState>,
): RoutedVersionsState => ({
  documentId,
  currentVersionId: extra?.currentVersionId ?? null,
  versionKind: extra?.versionKind ?? null,
});

const DOC = "doc-1";
// navIntent: NAV = the active payload arrived via ←/→ (re-assert its param);
// NO_NAV = the URL changed externally (an external close, not a navigation).
const NAV = true;
const NO_NAV = false;

describe("reconcileUrlAction — history → URL projection", () => {
  describe("cesare-peek payload", () => {
    it("does nothing when the URL already shows Cesare alone", () => {
      expect(
        reconcileUrlAction(cesarePeekPayload, peekActive, noVersions, NO_NAV),
      ).toEqual({ kind: "none" });
    });

    it("closes the host when Cesare is active, no routed param remains, and it was NOT a navigation (× / ESC / back)", () => {
      // NEITHER param set + no nav intent → the surface was closed externally.
      expect(
        reconcileUrlAction(cesarePeekPayload, noPeek, noVersions, NO_NAV),
      ).toEqual({ kind: "close-host" });
    });

    it("RE-OPENS Cesare when ←/→ navigated to it and its param is currently absent (e.g. back from the notifications host)", () => {
      // The notifications host dropped `?peek`; navigating back must re-assert it.
      expect(
        reconcileUrlAction(cesarePeekPayload, noPeek, noVersions, NAV),
      ).toEqual({ kind: "open-cesare" });
    });

    it("opens Cesare when ←/→ navigated to it WHILE the other routed param (versions) is set", () => {
      // The OTHER routed param still set ⇒ a history navigation, not a close.
      expect(
        reconcileUrlAction(
          cesarePeekPayload,
          noPeek,
          versionsUrl("other"),
          NAV,
        ),
      ).toEqual({ kind: "open-cesare" });
    });

    it("re-opens Cesare (dropping versions) when versions still owns the URL", () => {
      // Mutual exclusion: even though `?peek` is set, `?versions` coexisting
      // means the resolver yields to Versions — so Cesare must re-assert.
      expect(
        reconcileUrlAction(
          cesarePeekPayload,
          peekActive,
          versionsUrl(DOC),
          NO_NAV,
        ),
      ).toEqual({ kind: "open-cesare" });
    });
  });

  describe("versions payload", () => {
    it("does nothing when the URL already shows that version alone", () => {
      expect(
        reconcileUrlAction(
          versionsPayload(DOC),
          noPeek,
          versionsUrl(DOC),
          NO_NAV,
        ),
      ).toEqual({ kind: "none" });
    });

    it("opens versions (dropping peek) when the URL still shows Cesare", () => {
      // The classic A6 case: Cesare open, click VERSIONI → navigate the lane.
      const action = reconcileUrlAction(
        versionsPayload(DOC, {
          currentVersionId: "v9",
          versionKind: "narrative",
        }),
        peekActive,
        noVersions,
        NO_NAV,
      );
      expect(action).toEqual({
        kind: "open-versions",
        documentId: DOC,
        companions: { vcur: "v9", vkind: "narrative" },
      });
    });

    it("closes the host when versions is active, no routed param remains, and it was NOT a navigation (× / ESC / back)", () => {
      expect(
        reconcileUrlAction(versionsPayload(DOC), noPeek, noVersions, NO_NAV),
      ).toEqual({ kind: "close-host" });
    });

    it("RE-OPENS versions when ←/→ navigated to it and its param is currently absent", () => {
      expect(
        reconcileUrlAction(versionsPayload(DOC), noPeek, noVersions, NAV),
      ).toMatchObject({ kind: "open-versions", documentId: DOC });
    });

    it("re-opens when the URL points at a DIFFERENT document", () => {
      const action = reconcileUrlAction(
        versionsPayload(DOC),
        noPeek,
        versionsUrl("other-doc"),
        NO_NAV,
      );
      expect(action).toMatchObject({ kind: "open-versions", documentId: DOC });
    });

    it("re-opens (mutual exclusion) when peek still coexists with the right version", () => {
      expect(
        reconcileUrlAction(
          versionsPayload(DOC),
          peekActive,
          versionsUrl(DOC),
          NO_NAV,
        ),
      ).toMatchObject({ kind: "open-versions", documentId: DOC });
    });

    it("omits companions that are absent", () => {
      const action = reconcileUrlAction(
        versionsPayload(DOC),
        peekActive,
        noVersions,
        NO_NAV,
      );
      expect(action).toEqual({
        kind: "open-versions",
        documentId: DOC,
        companions: {},
      });
    });
  });

  describe("host kinds / null payload", () => {
    it("clears both routed params when a notifications payload owns the track over Cesare", () => {
      expect(
        reconcileUrlAction(
          notificationsPayload,
          peekActive,
          noVersions,
          NO_NAV,
        ),
      ).toEqual({ kind: "clear-both" });
    });

    it("clears both when a host payload owns the track over Versions", () => {
      expect(
        reconcileUrlAction(
          notificationsPayload,
          noPeek,
          versionsUrl(DOC),
          NO_NAV,
        ),
      ).toEqual({ kind: "clear-both" });
    });

    it("does nothing for a host payload when no routed param is set", () => {
      expect(
        reconcileUrlAction(notificationsPayload, noPeek, noVersions, NO_NAV),
      ).toEqual({ kind: "none" });
    });

    it("does nothing when the history is empty and a routed param lingers (effect-1 will mirror it)", () => {
      // A fresh `?peek=cesare` deep-link: payload is still null while effect-1
      // pushes the mirror. The reconciler must NOT clear the param here.
      expect(reconcileUrlAction(null, peekActive, noVersions, NO_NAV)).toEqual({
        kind: "none",
      });
    });

    it("does nothing when the history is empty and no routed param is set", () => {
      expect(reconcileUrlAction(null, noPeek, noVersions, NO_NAV)).toEqual({
        kind: "none",
      });
    });
  });
});
