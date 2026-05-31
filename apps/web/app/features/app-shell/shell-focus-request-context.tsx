import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// Spec 52 — a routed surface (the full-screen Cesare new-session landing) can
// ASK the shell to enter focus mode so the rail + topstrip recede and the
// landing owns the viewport. Focus mode otherwise lives entirely inside
// AppShell as transient local state toggled by ⌃⌥F; this context is the single
// narrow bridge that lets a child route request it declaratively.
//
// The contract is reference-counted so two nested requesters (defensive) and
// fast route transitions never leave the shell stuck in focus: AppShell reads
// `isFocusRequested` and forces `shellState === "focus"` only while at least one
// requester is mounted, restoring the user's prior density when the count drops
// to zero.
type ShellFocusRequestValue = {
  readonly isFocusRequested: boolean;
  /** Increment / decrement the focus-request count. */
  readonly requestFocus: () => void;
  readonly releaseFocus: () => void;
};

const ShellFocusRequestContext = createContext<ShellFocusRequestValue | null>(
  null,
);

export function ShellFocusRequestProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);
  const requestFocus = useCallback(() => setCount((c) => c + 1), []);
  const releaseFocus = useCallback(
    () => setCount((c) => Math.max(0, c - 1)),
    [],
  );
  const value = useMemo<ShellFocusRequestValue>(
    () => ({ isFocusRequested: count > 0, requestFocus, releaseFocus }),
    [count, requestFocus, releaseFocus],
  );
  return (
    <ShellFocusRequestContext.Provider value={value}>
      {children}
    </ShellFocusRequestContext.Provider>
  );
}

/** Read the live focus-request state (used by AppShell). Outside a provider it
 *  degrades to a stable no-op so isolated tests never crash. */
export function useShellFocusRequest(): ShellFocusRequestValue {
  const ctx = useContext(ShellFocusRequestContext);
  const noop = useCallback(() => undefined, []);
  return (
    ctx ?? { isFocusRequested: false, requestFocus: noop, releaseFocus: noop }
  );
}

/** Mount-scoped helper: requests shell focus while the calling component is
 *  mounted and releases it on unmount. The full-screen landing uses this so the
 *  shell recedes exactly for the lifetime of the landing route. */
export function useRequestShellFocus(): void {
  const { requestFocus, releaseFocus } = useShellFocusRequest();
  useEffect(() => {
    requestFocus();
    return () => releaseFocus();
  }, [requestFocus, releaseFocus]);
}
