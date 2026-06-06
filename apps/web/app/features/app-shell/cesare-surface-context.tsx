import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// A routed surface that IS itself a Cesare conversation (the full-screen session
// page `/projects/:id/sessions/:sessionId` and the new-session landing) must
// suppress the shell's floating Cesare drawer + BottomDock launcher pill — the
// chat already owns the viewport, so a second floating chat container would
// duplicate it.
//
// Reference-counted like `shell-focus-request-context` so nested requesters and
// fast route transitions never leave the shell stuck suppressing Cesare:
// AppShell reads `isCesareSurfaceActive` and hides the floating sheet + pill
// only while at least one surface is mounted.
type CesareSurfaceValue = {
  readonly isCesareSurfaceActive: boolean;
  /** Increment / decrement the active-surface count. */
  readonly registerSurface: () => void;
  readonly unregisterSurface: () => void;
};

const CesareSurfaceContext = createContext<CesareSurfaceValue | null>(null);

export function CesareSurfaceProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const registerSurface = useCallback(() => setCount((c) => c + 1), []);
  const unregisterSurface = useCallback(
    () => setCount((c) => Math.max(0, c - 1)),
    [],
  );
  const value = useMemo<CesareSurfaceValue>(
    () => ({
      isCesareSurfaceActive: count > 0,
      registerSurface,
      unregisterSurface,
    }),
    [count, registerSurface, unregisterSurface],
  );
  return (
    <CesareSurfaceContext.Provider value={value}>
      {children}
    </CesareSurfaceContext.Provider>
  );
}

/** Read the live surface state (used by AppShell). Outside a provider it
 *  degrades to inactive so isolated tests never crash. */
export function useCesareSurface(): CesareSurfaceValue {
  const ctx = useContext(CesareSurfaceContext);
  const noop = useCallback(() => undefined, []);
  return (
    ctx ?? {
      isCesareSurfaceActive: false,
      registerSurface: noop,
      unregisterSurface: noop,
    }
  );
}

/** Mount-scoped helper: marks the shell as showing a central Cesare surface
 *  while the calling component is mounted, so the floating drawer + pill stay
 *  hidden for the lifetime of the route. */
export function useRegisterCesareSurface(): void {
  const { registerSurface, unregisterSurface } = useCesareSurface();
  useEffect(() => {
    registerSurface();
    return () => unregisterSurface();
  }, [registerSurface, unregisterSurface]);
}
