// apps/web/app/features/app-shell/use-routed-surface.ts
//
// `useRoutedSurface` — the single place that owns the URL ↔ auxiliary-surface
// mapping (Spec 49 W1). Every routed surface (the Cesare `?peek=` column, the
// `?versions=` SplitDrawer, future ones) opens/closes by MUTATING a search
// param on the current host path — never by pure context state. Centralising
// that here removes the temptation for each consumer to hand-roll its own
// navigate({ search }) calls (DRY: one open/close contract for all surfaces).
//
// Contract (mirrors the Spec 46 `?peek=` model):
//   - `open(value, extra?)` sets the param on the CURRENT pathname so the host
//     route stays mounted (it only compresses). Each open is a new history
//     entry, so browser-back closes the surface.
//   - `close()` drops the param (and any companion params) — the `×` / ESC
//     handler. Browser-back hits the same cleared state.
//   - `setParam(name, value)` patches a single companion param in place
//     WITHOUT a new history entry (`replace`) — used for in-surface layout
//     toggles that should not pollute history (e.g. the compare selection).
//   - `navigateState(value, companions)` replaces the param set as a real
//     navigation (new history entry) — used for the `↗` expand → full route,
//     so `↙` / browser-back returns to the split.
//
// The hook is generic over the param name(s); each surface wraps it with its
// own typed helper (see `versions-peek` / `cesare-peek`).

import { useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

export interface UseRoutedSurfaceResult {
  /** The live raw value of the primary param (or `null` when absent). */
  readonly value: string | null;
  /** Whether the surface is currently open (its primary param is present). */
  readonly isOpen: boolean;
  /** Open the surface: set the primary param (+ optional companions). New history entry. */
  open: (value: string, companions?: Readonly<Record<string, string>>) => void;
  /** Close the surface: drop the primary param and every companion. New history entry. */
  close: () => void;
  /** Patch one companion param in place (replace — no history entry). */
  setParam: (name: string, value: string | null) => void;
  /** Re-set the surface as a real navigation (new history entry) — drives `↗`/`↙`. */
  navigateState: (
    value: string,
    companions?: Readonly<Record<string, string>>,
  ) => void;
}

export interface UseRoutedSurfaceOptions {
  /** The primary search-param name (e.g. `"versions"`, `"peek"`). */
  readonly param: string;
  /** Companion params cleared together with the primary on `close`. */
  readonly companions?: readonly string[];
}

/**
 * Read the current location search as a plain string map. TanStack typed
 * search is route-specific; this hook is route-agnostic, so we round-trip
 * through `window.location.search` shape via the location object. We only ever
 * carry string params, so this stays lossless for our surfaces.
 */
function readSearch(search: unknown): Record<string, string> {
  if (search == null || typeof search !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(search as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function useRoutedSurface(
  options: UseRoutedSurfaceOptions,
): UseRoutedSurfaceResult {
  const { param, companions = [] } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const search = readSearch(location.search);

  const value = search[param] ?? null;

  // The action callbacks must stay reference-stable across renders: consumers
  // feed them into `useMemo`/`useCallback` deps (e.g. a memoized TopBar actions
  // node). `readSearch` returns a fresh object every render, and a default
  // `companions` is a fresh array, so listing them as deps made the callbacks
  // change identity on every render — which loops `useTopBarSlotPublisher`
  // ("Maximum update depth"). We read the latest `search` through a ref and key
  // `companions` by a stable string instead.
  const searchRef = useRef(search);
  searchRef.current = search;
  const companionsKey = companions.join(",");
  const companionsList = useMemo(
    () => (companionsKey ? companionsKey.split(",") : []),
    [companionsKey],
  );

  const open = useCallback(
    (next: string, extra?: Readonly<Record<string, string>>) => {
      void navigate({
        to: pathname,
        search: { ...searchRef.current, ...extra, [param]: next },
      });
    },
    [navigate, pathname, param],
  );

  const close = useCallback(() => {
    const rest = { ...searchRef.current };
    delete rest[param];
    for (const c of companionsList) delete rest[c];
    void navigate({ to: pathname, search: rest });
  }, [navigate, pathname, param, companionsList]);

  const setParam = useCallback(
    (name: string, next: string | null) => {
      const nextSearch = { ...searchRef.current };
      if (next === null) delete nextSearch[name];
      else nextSearch[name] = next;
      // `replace` so an in-surface toggle doesn't stack a history entry the
      // user would have to back through to leave the surface.
      void navigate({ to: pathname, search: nextSearch, replace: true });
    },
    [navigate, pathname],
  );

  const navigateState = useCallback(
    (next: string, extra?: Readonly<Record<string, string>>) => {
      const rest = { ...searchRef.current };
      for (const c of companionsList) delete rest[c];
      void navigate({
        to: pathname,
        search: { ...rest, ...extra, [param]: next },
      });
    },
    [navigate, pathname, param, companionsList],
  );

  return {
    value,
    isOpen: value !== null,
    open,
    close,
    setParam,
    navigateState,
  };
}
