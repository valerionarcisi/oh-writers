// apps/web/app/features/app-shell/routed-surface-arbitration.ts
//
// FAIL-CLOSED arbitration for the routed auxiliary surfaces (BUG-N64).
//
// The shell grid reserves exactly ONE auxiliary track beside the main lane
// (Spec 46 / Spec 49): `rail | main | aux`. Two routed surfaces claim that
// track — the Cesare split lane (`?peek=cesare`) and the Versions SplitDrawer
// (`?versions=`). When a URL carries BOTH (a stale param surviving a later
// open, or a hand-crafted deep link), mounting both lanes breaks the grid: the
// fourth child wraps to an implicit row off-viewport and the layout collapses
// (the BUG-N64 blank page).
//
// This module is the single owner of the tie-break. Exactly one surface wins;
// the loser is CLOSED (its params stripped from the URL, its lane never
// mounted) — never both, never neither-with-leftover-params. The main lane is
// untouched in every outcome.
//
// Priority: VERSIONS WINS. The rule is deterministic by design — a cold deep
// link carries no recency information, so "most recent param" cannot be the
// tie-break. Versions takes the slot because the losing side keeps a fallback
// surface while the winner has none: Cesare remains one click away as the
// floating drawer (BottomDock pill, Spec 44), whereas the Versions lane is the
// ONLY home of version inspection/rollback (Spec 49 / Spec 66). Closing the
// peek loses nothing; closing versions would orphan the user's intent.
//
// Interactive opens never reach the tie-break: `useRoutedSurface` strips the
// rival's params at open time (`excludes`), so the surface being opened always
// wins live. This arbitration is the deep-link / stale-URL backstop.

/** Search params owned by the Cesare split lane (Spec 46 `?peek=`). */
export const CESARE_PEEK_PARAMS = ["peek"] as const;

/** Search params owned by the Versions SplitDrawer (Spec 49 `?versions=`). */
export const VERSIONS_SURFACE_PARAMS = [
  "versions",
  "vstate",
  "vcur",
  "vkind",
] as const;

/** Which routed surfaces currently claim the auxiliary slot (post-validation:
 *  a claim is `true` only when its param parsed fail-closed to a real open). */
export interface RoutedSurfaceClaims {
  readonly versionsOpen: boolean;
  readonly cesarePeekOpen: boolean;
}

export type RoutedSurfaceWinner = "versions" | "cesare-peek" | null;

export interface RoutedSurfaceArbitration {
  /** The single surface allowed to mount in the auxiliary slot. */
  readonly winner: RoutedSurfaceWinner;
  /** Params of the losing surface — strip them from the URL (replace, no
   *  history entry) so the URL stays the single source of truth. Empty when
   *  there is no conflict. */
  readonly paramsToStrip: readonly string[];
}

export function arbitrateRoutedSurfaces(
  claims: RoutedSurfaceClaims,
): RoutedSurfaceArbitration {
  const { versionsOpen, cesarePeekOpen } = claims;

  if (versionsOpen && cesarePeekOpen) {
    return { winner: "versions", paramsToStrip: CESARE_PEEK_PARAMS };
  }
  if (versionsOpen) {
    return { winner: "versions", paramsToStrip: [] };
  }
  if (cesarePeekOpen) {
    return { winner: "cesare-peek", paramsToStrip: [] };
  }
  return { winner: null, paramsToStrip: [] };
}
