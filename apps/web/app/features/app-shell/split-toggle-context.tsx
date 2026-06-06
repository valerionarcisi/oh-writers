// apps/web/app/features/app-shell/split-toggle-context.tsx
//
// Lets a chat surface (the session conversation page) publish an "open the split
// for the most recent edit" action, so the TopBar's ⊟ toggle can OPEN the split
// even when nothing has been opened yet — not only re-open a hidden one. The
// surface owns the data (which entity was edited last); the shell owns the
// button. When no opener is registered the ⊟ falls back to hide/re-open of the
// existing history (or stays disabled when there is nothing at all).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface SplitToggleContextValue {
  /** Open the split for the latest edit, or null when the active surface has
   *  none to show (→ the ⊟ relies on history / is disabled). */
  openLatest: (() => void) | null;
  /** Register/replace the active surface's "open latest" action. Pass null to
   *  clear it (on unmount / when the surface has no edit). */
  setOpenLatest: (fn: (() => void) | null) => void;
}

const SplitToggleContext = createContext<SplitToggleContextValue | null>(null);

export function SplitToggleProvider({ children }: { children: ReactNode }) {
  const [openLatest, setOpenLatestState] = useState<(() => void) | null>(null);
  // Wrap so a function value is stored, not treated as a state updater.
  const setOpenLatest = useCallback((fn: (() => void) | null) => {
    setOpenLatestState(() => fn);
  }, []);
  const value = useMemo<SplitToggleContextValue>(
    () => ({ openLatest, setOpenLatest }),
    [openLatest, setOpenLatest],
  );
  return (
    <SplitToggleContext.Provider value={value}>
      {children}
    </SplitToggleContext.Provider>
  );
}

export function useSplitToggle(): SplitToggleContextValue {
  const ctx = useContext(SplitToggleContext);
  return ctx ?? { openLatest: null, setOpenLatest: () => undefined };
}

/**
 * Called by a chat surface to publish its "open the split for the latest edit"
 * action. The latest callback is read through a ref, so re-publishing on every
 * render is cheap; the registration toggles only when the surface flips between
 * "has an edit to show" and "has none", and clears on unmount.
 */
export function useRegisterSplitOpener(fn: (() => void) | null): void {
  const { setOpenLatest } = useSplitToggle();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const hasFn = fn !== null;
  useEffect(() => {
    setOpenLatest(hasFn ? () => fnRef.current?.() : null);
    return () => setOpenLatest(null);
  }, [hasFn, setOpenLatest]);
}
