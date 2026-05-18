import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";

export type OpenCesareOptions = {
  requirementId?: string;
};

type CesareContextValue = {
  openCesare: (opts?: OpenCesareOptions) => void;
};

const CesareContext = createContext<CesareContextValue | null>(null);

export function CesareProvider({
  children,
  openCesare,
}: {
  children: ReactNode;
  openCesare: (opts?: OpenCesareOptions) => void;
}) {
  const value = useMemo(() => ({ openCesare }), [openCesare]);
  return <CesareContext.Provider value={value}>{children}</CesareContext.Provider>;
}

/**
 * Returns a stable `openCesare` callback that opens the Cesare sheet managed
 * by the nearest AppShell ancestor. Falls back to a no-op when used outside
 * an AppShell (e.g. in Storybook or isolated tests).
 */
export function useCesareOpen(): (opts?: OpenCesareOptions) => void {
  const ctx = useContext(CesareContext);
  const noop = useCallback(() => undefined, []);
  return ctx?.openCesare ?? noop;
}
