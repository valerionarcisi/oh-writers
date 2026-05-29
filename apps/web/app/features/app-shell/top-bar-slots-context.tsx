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
  const [slots, setSlots] = useState<TopBarSlots>({ elementLegend: null });

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
  if (!ctx) return { elementLegend: null };
  return ctx.slots;
}

/**
 * Publish a node into one of the shell-level TopBar slots while the
 * caller is mounted. The slot clears automatically on unmount so a stale
 * legend cannot leak across routes.
 */
export function useTopBarSlotPublisher<K extends keyof TopBarSlots>(
  key: K,
  value: TopBarSlots[K] | null,
): void {
  const ctx = useContext(TopBarSlotsContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setSlot(key, value);
    return () => {
      ctx.setSlot(key, null);
    };
  }, [ctx, key, value]);
}
