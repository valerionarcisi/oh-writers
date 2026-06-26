// apps/web/app/features/app-shell/use-unified-split-navigation.ts
//
// `useUnifiedSplitNavigation` — the deep module that makes the single auxiliary
// split track navigable across the routed lanes (Cesare PEEK + Versioni) and the
// imperative host lanes (preview + notifications) with ONE browser-like history
// (Spec 78 A6).
//
// The problem it solves
// ─────────────────────
// Cesare peek (`?peek=cesare`) and Versions (`?versions=`) are SEPARATE routed
// lanes, each driven by its own URL search param. The BUG-N64 single-aux-lane
// resolver renders at most ONE of them, suppressing the other — so opening
// Versioni while Cesare is in split hid the versions UNDER Cesare. Meanwhile the
// shell SplitDrawer host already owned a generic history stack (open/back/forward
// + ←/→ arrows) used only for preview + notifications.
//
// The unification
// ───────────────
// The SplitDrawer history stack becomes the SINGLE source of "which auxiliary
// surface is showing + where in the nav we are". The routed lanes are MIRRORED
// into that stack as navigation records (`cesare-peek` / `versions` payloads),
// so opening Versioni while Cesare is up PUSHES a history entry instead of
// suppressing it. Two reconciling effects keep the URL and the history in sync:
//
//   1. URL → history: when the routed Cesare peek or Versions surface becomes
//      active, push (deduped) the matching payload so it joins the shared stack.
//   2. history → URL: when the active payload is a routed kind, project it back
//      to the URL (set `?peek` / `?versions`, clear the other). When it is a
//      host kind (preview / notifications) or none, clear both routed params.
//
// Both effects are IDEMPOTENT — they only navigate when the URL genuinely
// disagrees with the active payload — so the round-trip cannot loop. ←/→ simply
// move the history cursor; effect (2) then drives the URL, which re-renders the
// right lane. Closing the host (`close()`) clears the whole stack AND the URL.
//
// Invariants preserved
// ────────────────────
//   - BUG-N64: still at most ONE lane live (the resolver in AppShell renders one
//     lane; this module only decides WHICH, by the active payload). The main
//     track never collapses to 0.
//   - Spec 49 (URL is the routed-surface source of truth): the URL still reflects
//     the active routed surface; deep links keep working.
//   - Cesare SESSIONS stay a central route, never a peek (this module never
//     touches `/sessions/...`).
//
// This hook is framework-aware (it reads/writes the router) but carries NO React
// rendering — it returns the shared history controls the lanes wire their ←/→ to.

import { useEffect, useMemo, useRef } from "react";
import { match } from "ts-pattern";
import type {
  SplitDrawerPayload,
  useSplitDrawer,
} from "./split-drawer-context";

type SplitDrawerApi = ReturnType<typeof useSplitDrawer>;

/** The routed Cesare-peek surface state, as resolved by the shell. */
export interface RoutedCesarePeekState {
  /** Whether `?peek=cesare` resolves to the Cesare split lane right now. */
  readonly isActive: boolean;
}

/** The routed Versions surface state, as resolved by the shell. */
export interface RoutedVersionsState {
  /** The versioned entity id when the split Versions lane is active, else null. */
  readonly documentId: string | null;
  /** `?vcur=` companion (current baseline), or null. */
  readonly currentVersionId: string | null;
  /** `?vkind=` companion (`screenplay` | `narrative`), or null. */
  readonly versionKind: string | null;
}

/** URL mutators the shell already owns (one open/close contract per surface). */
export interface UnifiedSplitNavigationActions {
  /** Set `?peek=cesare` on the current route (new history entry). */
  readonly openCesarePeek: () => void;
  /** Drop `?peek`. */
  readonly closeCesarePeek: () => void;
  /** Set `?versions=<id>` (+ companions) on the current route. */
  readonly openVersions: (
    documentId: string,
    companions: Readonly<Record<string, string>>,
  ) => void;
  /** Drop `?versions` (+ companions). */
  readonly closeVersions: () => void;
}

export interface UseUnifiedSplitNavigationArgs {
  readonly splitDrawer: SplitDrawerApi;
  readonly cesarePeek: RoutedCesarePeekState;
  readonly versions: RoutedVersionsState;
  readonly actions: UnifiedSplitNavigationActions;
}

/**
 * Does the active payload already match the live URL for the routed kinds?
 * Used to keep the history → URL effect idempotent (only navigate on a genuine
 * mismatch, never echo the URL the user just arrived at).
 */
/**
 * The URL action that reconciles the live routed params with the active history
 * payload. Pure + exhaustive so the history→URL projection is unit-testable in
 * isolation (the effect just runs the returned action):
 *   - `"none"` — the URL already matches the active payload; do nothing.
 *   - `"open-cesare"` — set `?peek=cesare` (drops `?versions`).
 *   - `"open-versions"` — set `?versions=<id>` (drops `?peek`).
 *   - `"clear-both"` — a host kind / no payload owns the track: drop both routed
 *     params so the host body (or nothing) shows.
 *
 * Mutual exclusion is the invariant: the two routed params must NEVER coexist,
 * or the BUG-N64 resolver would render two lanes for the single track.
 */
export type UrlReconcileAction =
  | { readonly kind: "none" }
  | { readonly kind: "open-cesare" }
  | {
      readonly kind: "open-versions";
      readonly documentId: string;
      readonly companions: Readonly<Record<string, string>>;
    }
  | { readonly kind: "clear-both" }
  | { readonly kind: "close-host" };

/** The `versions` surface coordinates the mirror needs to compare for identity. */
export interface VersionsMirrorIdentity {
  readonly documentId: string;
  readonly currentVersionId: string | null;
  readonly versionKind: string | null;
}

/**
 * Is the routed surface ALREADY the active shared-history entry, with the SAME
 * coordinates? Used to make the URL → history mirror (Effect 1) strictly
 * idempotent: re-mirroring a surface that is already the cursor entry must be a
 * NO-OP, never another `open()` (which would reset `navIntentRef` and re-fire the
 * cursor/state setters). Without this guard a routed param flip that lands back on
 * the already-active payload still churns the context — the seed of the
 * URL ↔ history oscillation the unified host is supposed to settle.
 *
 * For `versions` the identity is the FULL coordinate set — `documentId` AND the
 * `currentVersionId` / `versionKind` companions — not the `documentId` alone.
 * The history dedupe key is `versions:<documentId>`, so a companion-only change
 * (same document, new `?vcur` / `?vkind`) keeps the same entry; the mirror MUST
 * still run `open()` to refresh that entry's companions in place, or the stale
 * companions get projected back to the URL by Effect 2 and clobber the user's
 * baseline/kind selection. Hence the guard skips ONLY a fully-identical payload.
 * For `cesare-peek` the surface has a single identity, so kind match is enough.
 */
export function isPayloadActive(
  payload: SplitDrawerPayload | null,
  kind: "cesare-peek" | "versions",
  versionsIdentity?: VersionsMirrorIdentity,
): boolean {
  if (payload === null) return false;
  if (payload.kind !== kind) return false;
  if (payload.kind === "versions") {
    return (
      versionsIdentity !== undefined &&
      payload.documentId === versionsIdentity.documentId &&
      (payload.currentVersionId ?? null) ===
        versionsIdentity.currentVersionId &&
      (payload.versionKind ?? null) === versionsIdentity.versionKind
    );
  }
  return true;
}

export function reconcileUrlAction(
  payload: SplitDrawerPayload | null,
  cesarePeek: RoutedCesarePeekState,
  versions: RoutedVersionsState,
  navIntent: boolean,
  hostSupersede: boolean,
): UrlReconcileAction {
  const noRoutedParam = !cesarePeek.isActive && versions.documentId === null;

  // No active payload: the history is empty. A routed param in the URL (e.g. a
  // fresh `?peek=cesare` deep-link) is about to be MIRRORED into the history by
  // effect-1 — the reconciler must NOT clear it here (that would fight the
  // mirror and the lane would never open). With no param either, there's simply
  // nothing to do. Hence: null payload ⇒ always `none`.
  if (payload === null) return { kind: "none" };

  // A ROUTED payload is active but NEITHER routed param is in the URL. Two cases,
  // told apart by `navIntent` (set by `back`/`forward`, reset by `open`/`close`):
  //   - NAVIGATED here via ←/→ from a sibling that had ceded the URL (e.g. back
  //     to Cesare from the notifications host, which dropped `?peek`) ⇒ re-assert
  //     this surface's param below (navIntent true).
  //   - the surface's OWN param was cleared externally (× / ESC / browser-back)
  //     while it was active ⇒ close the host, dropping the stale history so
  //     effect-1 doesn't re-push it (navIntent false).
  // "No other param set" alone cannot distinguish them: a back to Cesare from a
  // host kind leaves no routed param either, yet must re-open, not close.
  if (
    (payload.kind === "cesare-peek" || payload.kind === "versions") &&
    noRoutedParam &&
    !navIntent
  ) {
    return { kind: "close-host" };
  }

  // COEXISTENCE GUARD (the split-lane render loop, #47/#48/#49). Both routed
  // params can briefly coexist in the URL while a flip is in flight (e.g. opening
  // Cesare-split over an open Versions lane: `?peek` is set before `?versions` is
  // dropped). With both present, the two payload branches below "win" in OPPOSITE
  // directions — a `cesare-peek` payload sees `versions.documentId !== null` and
  // fires `open-cesare` (drops `?versions`), while a `versions` payload sees
  // `cesarePeek.isActive` and fires `open-versions` (drops `?peek`) — so the
  // effects ping-pong the URL forever ("Maximum update depth"). Resolve the
  // coexistence ONCE, deterministically, the SAME way the AppShell single-lane
  // resolver does: an explicit `?peek=cesare` WINS the track, so drop `?versions`
  // and let Cesare own the lane. This converges to a single routed param.
  if (cesarePeek.isActive && versions.documentId !== null) {
    return { kind: "open-cesare" };
  }

  if (payload.kind === "cesare-peek") {
    // Cesare's param is set and Versions has ceded (coexistence handled above):
    // the URL already matches a Cesare-owned track ⇒ nothing to do.
    if (cesarePeek.isActive) return { kind: "none" };
    // Cesare's param is ABSENT but the SIBLING routed surface (`?versions`) now
    // owns the URL — and this was NOT a ←/→ navigation. Versioni SUPERSEDED Cesare
    // (the version surface drops `?peek` on open; Spec 78 A6 / `useRoutedSurface`
    // `conflicts`), so for a tick the active payload is still the OLD `cesare-peek`
    // entry while Effect 1's versions mirror catches up the cursor. Do NOTHING
    // here: re-asserting `?peek` (`open-cesare`) would drop `?versions` and seed
    // the ping-pong (#47, 243+ navigations); closing the host would destroy the
    // Cesare back-step the A6 shared history needs. `none` lets Effect 1 move the
    // cursor to versions, after which this effect settles — WITHOUT touching the
    // URL or the history. A genuine ←/→ BACK to Cesare (navIntent) while versions
    // lingers is the OPPOSITE intent and re-asserts Cesare below.
    if (versions.documentId !== null && !navIntent) {
      return { kind: "none" };
    }
    // The param is absent because either: a ←/→ back to Cesare from a host kind /
    // versions sibling (navIntent), or Cesare's own param was just cleared — in
    // both surviving cases re-assert it.
    return { kind: "open-cesare" };
  }
  if (payload.kind === "versions") {
    // Versions wins only when its param matches AND Cesare has ceded (the two
    // routed params must never coexist — coexistence is resolved above).
    const matches =
      versions.documentId === payload.documentId && !cesarePeek.isActive;
    if (matches) return { kind: "none" };
    // The SIBLING routed surface (`?peek`) now owns the URL and this was NOT a
    // ←/→ navigation — Cesare SUPERSEDED Versioni. Symmetric to the cesare-peek
    // branch: do NOTHING (`none`) and let Effect 1's Cesare mirror move the cursor
    // off this stale `versions` entry. Re-asserting `?versions` would drop `?peek`
    // and seed the ping-pong (#47). A genuine ←/→ back to versions (navIntent)
    // re-asserts instead, falling through below.
    if (cesarePeek.isActive && !navIntent) return { kind: "none" };
    const companions: Record<string, string> = {};
    if (payload.currentVersionId) companions["vcur"] = payload.currentVersionId;
    if (payload.versionKind) companions["vkind"] = payload.versionKind;
    return {
      kind: "open-versions",
      documentId: payload.documentId,
      companions,
    };
  }
  // Host kind (preview / notifications): the track must carry no routed param.
  // Whether a lingering routed param is EVICTED (`clear-both`) or LEFT for Effect
  // 1 to mirror (`none`) turns on WHY this host payload is active:
  //   - `hostSupersede` — the host was just opened OVER a routed surface (bell /
  //     preview over Cesare / Versioni): it owns the track, the param is stale →
  //     drop it.
  //   - `navIntent` — the user ←/→ NAVIGATED to this host entry while a sibling
  //     routed param still owned the URL (e.g. back to notifications from the
  //     versions lane): the param belongs to the surface we left → drop it so the
  //     host body shows alone.
  //   - neither — the host payload is merely the STILL-ACTIVE cursor entry while a
  //     routed param is being MIRRORED in (Versioni opened from a header button
  //     over the notifications host; Effect 1 has not yet moved the cursor). Here
  //     `clear-both` would yank the fresh param before Effect 1 pushes the routed
  //     entry, collapsing the whole host (Bug 2). DEFER (`none`): Effect 1 moves
  //     the cursor onto the freshly-mirrored routed entry, then this settles.
  if (noRoutedParam) return { kind: "none" };
  return hostSupersede || navIntent ? { kind: "clear-both" } : { kind: "none" };
}

export function useUnifiedSplitNavigation({
  splitDrawer,
  cesarePeek,
  versions,
  actions,
}: UseUnifiedSplitNavigationArgs): void {
  const {
    open,
    payload,
    close,
    consumeNavIntent,
    peekNavIntent,
    consumeHostSupersede,
    peekHostSupersede,
  } = splitDrawer;
  const { openCesarePeek, closeCesarePeek, openVersions, closeVersions } =
    actions;

  // Callers build fresh `cesarePeek` / `versions` objects every render (inline
  // literals), so depending on them directly would re-run the effects on EVERY
  // render — the engine of the bell-while-Cesare feedback loop (Effect 2 fires,
  // navigates, re-renders, fires again). Reduce them to their PRIMITIVE fields
  // and re-memoise stable objects keyed on those primitives, so the effects run
  // only when the URL-driven surface state genuinely changes.
  const peekActive = cesarePeek.isActive;
  const versionsDocumentId = versions.documentId;
  const versionsCurrentVersionId = versions.currentVersionId;
  const versionsKind = versions.versionKind;

  const stableCesarePeek = useMemo<RoutedCesarePeekState>(
    () => ({ isActive: peekActive }),
    [peekActive],
  );
  const stableVersions = useMemo<RoutedVersionsState>(
    () => ({
      documentId: versionsDocumentId,
      currentVersionId: versionsCurrentVersionId,
      versionKind: versionsKind,
    }),
    [versionsDocumentId, versionsCurrentVersionId, versionsKind],
  );

  // The active payload, read through a ref so the URL → history mirror (Effect 1)
  // can CHECK it without DEPENDING on it. Listing `payload` as an Effect-1 dep
  // would re-fire the mirror on every ←/→ cursor move, re-pushing the routed
  // surface and snapping a back-navigation forward again (the exact oscillation
  // the unified host must avoid). The mirror's only legitimate trigger is a
  // URL-param change; it merely needs the latest payload to no-op when the
  // surface is already active.
  const payloadRef = useRef<SplitDrawerPayload | null>(payload);
  payloadRef.current = payload;

  // ── Effect 1: URL → history ───────────────────────────────────────────────
  // Mirror each routed surface into the shared stack when its URL param turns
  // active. The context dedupes by payload key, so a surface already in history
  // is refreshed in place (no duplicate push); a NEW surface pushes a fresh entry
  // (so opening Versioni over Cesare adds a back-step to Cesare).
  //
  // Idempotency guard (`isPayloadActive`): when the surface is ALREADY the active
  // cursor entry, skip `open()` entirely. `open()` resets `navIntentRef` and runs
  // the cursor/state setters, so re-mirroring an already-active payload (after a
  // routed-param flip that settles back onto it) churns the context for nothing —
  // the seed of the URL ↔ history oscillation. With this guard each mirror runs
  // at most once per genuine surface change, so the round-trip converges to a
  // fixpoint and cannot ping-pong.
  useEffect(() => {
    if (!peekActive) return;
    if (isPayloadActive(payloadRef.current, "cesare-peek")) return;
    open({ kind: "cesare-peek" });
  }, [peekActive, open]);

  useEffect(() => {
    if (versionsDocumentId === null) return;
    if (
      isPayloadActive(payloadRef.current, "versions", {
        documentId: versionsDocumentId,
        currentVersionId: versionsCurrentVersionId,
        versionKind: versionsKind,
      })
    )
      return;
    open({
      kind: "versions",
      documentId: versionsDocumentId,
      currentVersionId: versionsCurrentVersionId,
      versionKind: versionsKind,
    });
  }, [versionsDocumentId, versionsCurrentVersionId, versionsKind, open]);

  // ── Effect 2: history → URL ───────────────────────────────────────────────
  // Project the active payload back to the URL whenever they disagree. This is
  // what makes ←/→ actually navigate: moving the cursor changes `payload`, and
  // this effect reconciles the URL to match, which re-renders the right lane.
  //
  // The `lastReconciledRef` signature includes BOTH the action AND the live URL
  // state it was computed from, so the same navigation fires AT MOST ONCE per
  // distinct (action × URL) — a render storm while the router catches up cannot
  // re-fire it, and it only re-fires after the URL actually changes. Once the
  // URL matches the payload, `reconcileUrlAction` returns `none` and the ref
  // resets. This is what kills the bell-while-Cesare feedback loop: opening the
  // bell yields the track ONCE (drops `?peek`), then settles.
  const lastReconciledRef = useRef<string | null>(null);
  useEffect(() => {
    // PEEK (do not reset) whether the active payload arrived via a ←/→ navigation:
    // a back/forward to a routed surface whose param is currently absent must
    // RE-OPEN it rather than be mistaken for an external close or a stale-payload
    // supersede. We must NOT consume the intent on a tick that resolves to a no-op
    // (`none`) or to a navigation we've already issued — a transient reconcile tick
    // doing so would swallow the intent before the real transition reads it, which
    // broke ←/→ back to Cesare while a sibling routed param lingered. So peek here
    // and consume ONLY when we actually issue a navigation below.
    const navIntent = peekNavIntent();
    // PEEK (do not reset) the host-supersede flag too: it authorises `clear-both`
    // ONLY for a host payload that was just opened over a routed surface. Peeking
    // (not consuming) here means a no-op reconcile tick can't swallow it before
    // the real clear-both transition reads it — same discipline as nav-intent.
    const hostSupersede = peekHostSupersede();
    const action = reconcileUrlAction(
      payload,
      stableCesarePeek,
      stableVersions,
      navIntent,
      hostSupersede,
    );
    if (action.kind === "none") {
      lastReconciledRef.current = null;
      return;
    }
    const actionKey =
      action.kind === "open-versions"
        ? `open-versions:${action.documentId}`
        : action.kind;
    // Signature ties the action to the URL state it was computed from, so the
    // same navigation fires AT MOST ONCE per distinct (action × URL): a render
    // storm while the router catches up cannot re-fire it, and it only re-fires
    // after the URL actually changes. This is the bell-while-Cesare loop guard.
    const urlState = `${peekActive ? "p" : ""}:${versionsDocumentId ?? ""}`;
    const signature = `${actionKey}@${urlState}`;
    if (lastReconciledRef.current === signature) return;
    lastReconciledRef.current = signature;

    // We are about to actually navigate — NOW consume the nav intent so the next
    // genuine transition starts clean (and a no-op tick above never swallowed it).
    consumeNavIntent();

    // `none` is handled by the early return above, so the match covers the four
    // navigating actions exhaustively.
    match(action)
      .with({ kind: "open-cesare" }, () => openCesarePeek())
      .with({ kind: "open-versions" }, ({ documentId, companions }) =>
        openVersions(documentId, companions),
      )
      .with({ kind: "clear-both" }, () => {
        // The host genuinely superseded a routed surface — consume the
        // authorisation so the next stale-host tick can't re-fire clear-both.
        consumeHostSupersede();
        if (peekActive) closeCesarePeek();
        if (versionsDocumentId !== null) closeVersions();
      })
      // A routed surface was closed externally (× / ESC / browser-back dropped
      // its param): clear the shared history so effect-1 stops re-pushing it and
      // the whole host collapses. The URL is already clean — nothing to navigate.
      .with({ kind: "close-host" }, () => close())
      .exhaustive();
  }, [
    payload,
    stableCesarePeek,
    stableVersions,
    peekActive,
    versionsDocumentId,
    consumeNavIntent,
    peekNavIntent,
    consumeHostSupersede,
    peekHostSupersede,
    openCesarePeek,
    closeCesarePeek,
    openVersions,
    closeVersions,
    close,
  ]);
}
