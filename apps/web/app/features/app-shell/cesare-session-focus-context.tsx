import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// Spec 47-A5 — shared "focused session" so the central `/sessions/:sessionId`
// route and the authoritative floating CesareDrawer agree on which session is
// active WITHOUT forking a second chat container.
//
// The route sets `focusedSessionId` on mount; `CesareSheet` reads it and adopts
// it as its active session (the drawer is the single source of truth for the
// conversation). When the user switches sessions inside the drawer, the drawer
// publishes back through `setFocusedSessionId` so the rail / route highlight
// stays in sync.
type CesareSessionFocusValue = {
  focusedSessionId: string | null;
  setFocusedSessionId: (sessionId: string | null) => void;
};

const CesareSessionFocusContext = createContext<CesareSessionFocusValue | null>(
  null,
);

export function CesareSessionFocusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const value = useMemo<CesareSessionFocusValue>(
    () => ({ focusedSessionId, setFocusedSessionId }),
    [focusedSessionId],
  );
  return (
    <CesareSessionFocusContext.Provider value={value}>
      {children}
    </CesareSessionFocusContext.Provider>
  );
}

// Returns the live focus value. Outside a provider it degrades to a stable
// no-op so isolated component tests and Storybook don't crash.
export function useCesareSessionFocus(): CesareSessionFocusValue {
  const ctx = useContext(CesareSessionFocusContext);
  const noop = useCallback(() => undefined, []);
  return ctx ?? { focusedSessionId: null, setFocusedSessionId: noop };
}
