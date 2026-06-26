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
  isPayloadActive,
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

    it("does NOTHING when a STALE cesare-peek payload lingers but `?versions` now owns the URL — the #47 loop", () => {
      // THE regression that still looped after the coexistence guard: opening
      // Versioni drops `?peek` at the source (`useRoutedSurface` conflicts), so
      // the URL is `?versions=` alone — but the shared-history cursor may still
      // sit on the old `cesare-peek` entry for a tick. The PREVIOUS code re-asserted
      // `?peek` here (`open-cesare`), which dropped `?versions`; Effect 1 then
      // re-mirrored versions and the two ping-ponged forever (243+ navigations
      // observed live). The fix returns `none`: do NOT touch the URL or history —
      // Effect 1's versions mirror moves the cursor off the stale Cesare entry
      // (which STAYS as the A6 back-step). peek absent + versions present + NOT a
      // ←/→ nav.
      expect(
        reconcileUrlAction(cesarePeekPayload, noPeek, versionsUrl(DOC), NO_NAV),
      ).toEqual({ kind: "none" });
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

    it("does NOTHING when a stale versions payload lingers but `?peek` now owns the URL (symmetric to the #47 loop guard)", () => {
      // The A6 flow: opening Versioni drops `?peek` AT THE SOURCE
      // (`useRoutedSurface` `conflicts: ["peek"]`), and opening Cesare drops
      // `?versions` likewise — the two routed params never coexist in the URL.
      // So a `versions` payload while `?peek` (not `?versions`) owns the URL means
      // Cesare SUPERSEDED Versioni, leaving a stale versions entry. The reconciler
      // returns `none` (URL is the source of truth; Effect 1 moves the cursor off
      // the stale entry) rather than re-assert `?versions` — re-asserting would
      // drop `?peek`, Effect 1 would re-mirror Cesare, and the two would ping-pong
      // (the #47 loop). Not a ←/→ nav.
      const action = reconcileUrlAction(
        versionsPayload(DOC, {
          currentVersionId: "v9",
          versionKind: "narrative",
        }),
        peekActive,
        noVersions,
        NO_NAV,
      );
      expect(action).toEqual({ kind: "none" });
    });

    it("RE-OPENS versions (dropping peek) on a genuine ←/→ back to it while `?peek` lingers", () => {
      // The OPPOSITE intent from the supersede-cede above: a real history
      // navigation back to versions must re-assert its param even though the
      // sibling `?peek` is still in the URL.
      const action = reconcileUrlAction(
        versionsPayload(DOC, {
          currentVersionId: "v9",
          versionKind: "narrative",
        }),
        peekActive,
        noVersions,
        NAV,
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

    it("resolves param coexistence to Cesare (open-cesare), never ping-ponging to versions", () => {
      // The #47/#48/#49 split-lane loop: both routed params briefly coexist
      // while a flip is in flight. A `versions` payload must NOT fire
      // `open-versions` (which would drop `?peek` and let a `cesare-peek`
      // payload fire `open-cesare` right back — the infinite ping-pong). The
      // coexistence guard resolves it ONCE, the same way the AppShell single-lane
      // resolver does: an explicit `?peek=cesare` wins the track, so drop
      // `?versions` and converge on Cesare.
      expect(
        reconcileUrlAction(
          versionsPayload(DOC),
          peekActive,
          versionsUrl(DOC),
          NO_NAV,
        ),
      ).toMatchObject({ kind: "open-cesare" });
    });

    it("resolves coexistence to Cesare from a cesare-peek payload too (symmetric, no flip)", () => {
      expect(
        reconcileUrlAction(
          cesarePeekPayload,
          peekActive,
          versionsUrl(DOC),
          NO_NAV,
        ),
      ).toMatchObject({ kind: "open-cesare" });
    });

    it("omits companions that are absent on a genuine ←/→ re-open", () => {
      const action = reconcileUrlAction(
        versionsPayload(DOC),
        peekActive,
        noVersions,
        NAV,
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

// Full versions identity (documentId + companions) for the guard.
const versionsId = (
  documentId: string,
  extra?: Partial<{
    currentVersionId: string | null;
    versionKind: string | null;
  }>,
) => ({
  documentId,
  currentVersionId: extra?.currentVersionId ?? null,
  versionKind: extra?.versionKind ?? null,
});

describe("isPayloadActive — URL → history mirror idempotency guard", () => {
  it("is false for a null payload (history empty → mirror must push)", () => {
    expect(isPayloadActive(null, "cesare-peek")).toBe(false);
    expect(isPayloadActive(null, "versions", versionsId(DOC))).toBe(false);
  });

  it("matches the cesare-peek payload by kind alone", () => {
    expect(isPayloadActive(cesarePeekPayload, "cesare-peek")).toBe(true);
  });

  it("does NOT treat a versions payload as an active cesare-peek (and vice-versa)", () => {
    expect(isPayloadActive(versionsPayload(DOC), "cesare-peek")).toBe(false);
    expect(
      isPayloadActive(cesarePeekPayload, "versions", versionsId(DOC)),
    ).toBe(false);
    expect(isPayloadActive(notificationsPayload, "cesare-peek")).toBe(false);
    expect(
      isPayloadActive(notificationsPayload, "versions", versionsId(DOC)),
    ).toBe(false);
  });

  it("matches a versions payload only when the documentId is the SAME", () => {
    expect(
      isPayloadActive(versionsPayload(DOC), "versions", versionsId(DOC)),
    ).toBe(true);
    expect(
      isPayloadActive(versionsPayload(DOC), "versions", versionsId("other")),
    ).toBe(false);
  });

  it("does NOT match when only the companions differ (so the mirror still refreshes them)", () => {
    // Same documentId, but the active payload carries a DIFFERENT baseline/kind:
    // the guard must NOT skip, or Effect 2 re-projects the stale companions and
    // clobbers the user's `?vcur` / `?vkind` selection (review finding 1d).
    const payload = versionsPayload(DOC, {
      currentVersionId: "v1",
      versionKind: "narrative",
    });
    expect(
      isPayloadActive(
        payload,
        "versions",
        versionsId(DOC, { currentVersionId: "v2" }),
      ),
    ).toBe(false);
    expect(
      isPayloadActive(
        payload,
        "versions",
        versionsId(DOC, { versionKind: "screenplay" }),
      ),
    ).toBe(false);
    // Identical coordinates → skip is safe.
    expect(
      isPayloadActive(
        payload,
        "versions",
        versionsId(DOC, { currentVersionId: "v1", versionKind: "narrative" }),
      ),
    ).toBe(true);
  });

  it("treats absent companions and explicit null as the same identity", () => {
    // Payload built without companions (null) must equal a URL identity with null.
    expect(
      isPayloadActive(versionsPayload(DOC), "versions", versionsId(DOC)),
    ).toBe(true);
  });

  it("guards the mirror: an already-active surface is a no-op (true), a new one is not (false)", () => {
    expect(isPayloadActive(cesarePeekPayload, "cesare-peek")).toBe(true);
    expect(
      isPayloadActive(cesarePeekPayload, "versions", versionsId(DOC)),
    ).toBe(false);
  });
});
