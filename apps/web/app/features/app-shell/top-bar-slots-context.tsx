// apps/web/app/features/app-shell/top-bar-slots-context.tsx
//
// Per-page TopBar slot publishing.
//
// AppShell mounts a single slim TopBar. The slim TopBar exposes optional
// slots (e.g. the `elementLegend` second row for Sceneggiatura — Spec 44
// glossary). Per-page components live below the shell in the route tree
// and need a way to fill those slots without prop-drilling through every
// layout boundary. This context mirrors the `SaveStateContext` pattern:
//
//   - `<TopBarSlotsProvider/>` wraps everything inside AppShell.
//   - `useTopBarSlots()` reads the current slot values (consumed by the
//     shell's TopBar render).
//   - `useTopBarSlotPublisher()` lets a page publish a node into a slot
//     for the duration of its mount; clearing happens on unmount.
//
// Today the only slot is `elementLegend`. Add new keys here whenever a new
// per-page surface needs to live in the shell-level TopBar.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface TopBarSlots {
  elementLegend: ReactNode | null;
  /** Absolutely-centred middle slot (e.g. LoglinePill on narrative doc pages). */
  center: ReactNode | null;
  /** Extra actions injected into the TopBar right slot (e.g. export button). */
  actions: ReactNode | null;
}

interface TopBarSlotsContextValue {
  slots: TopBarSlots;
  setSlot: <K extends keyof TopBarSlots>(
    key: K,
    value: TopBarSlots[K] | null,
  ) => void;
}

const TopBarSlotsContext = createContext<TopBarSlotsContextValue | null>(null);

export function TopBarSlotsProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<TopBarSlots>({
    elementLegend: null,
    center: null,
    actions: null,
  });

  const setSlot = useCallback<TopBarSlotsContextValue["setSlot"]>(
    (key, value) => {
      setSlots((prev) =>
        prev[key] === value ? prev : { ...prev, [key]: value },
      );
    },
    [],
  );

  const ctx = useMemo<TopBarSlotsContextValue>(
    () => ({ slots, setSlot }),
    [slots, setSlot],
  );

  return (
    <TopBarSlotsContext.Provider value={ctx}>
      {children}
    </TopBarSlotsContext.Provider>
  );
}

export function useTopBarSlots(): TopBarSlots {
  const ctx = useContext(TopBarSlotsContext);
  if (!ctx) return { elementLegend: null, center: null, actions: null };
  return ctx.slots;
}

/**
 * Publish a node into one of the shell-level TopBar slots while the
 * caller is mounted. The slot clears automatically on unmount so a stale
 * legend cannot leak across routes.
 */
/**
 * Publish a node into one of the shell-level TopBar slots while the
 * caller is mounted. The slot clears automatically on unmount so a stale
 * legend cannot leak across routes.
 *
 * IMPORTANT: callers must stabilize `value` with `useMemo` before passing it
 * here. A new ReactNode reference on every render re-runs the publish effect,
 * and since ReactNode references are never reference-equal the slot keeps
 * updating — an infinite setState loop ("Maximum update depth exceeded").
 */
export function useTopBarSlotPublisher<K extends keyof TopBarSlots>(
  key: K,
  value: TopBarSlots[K] | null,
): void {
  const ctx = useContext(TopBarSlotsContext);
  // Depend ONLY on the stable `setSlot` (a `useCallback([])`), never on the
  // whole `ctx` object: `ctx` is a `useMemo([slots, setSlot])` whose reference
  // changes every time the slots update. Depending on `ctx` here re-ran the
  // effect on each publish — cleanup cleared the slot, the body re-set it, the
  // slots changed, `ctx` changed, and the effect fired again, an infinite loop.
  const setSlot = ctx?.setSlot;
  useEffect(() => {
    if (!setSlot) return;
    setSlot(key, value);
    return () => {
      setSlot(key, null);
    };
  }, [setSlot, key, value]);
}
