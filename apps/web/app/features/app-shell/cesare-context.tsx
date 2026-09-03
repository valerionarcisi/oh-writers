import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { Features } from "@oh-writers/domain";
import { useOptionalFeature } from "~/features/feature-flags";

export type OpenCesareOptions = {
  requirementId?: string;
  /** A prompt to send IMMEDIATELY once the floating chat opens — e.g. a margin
   *  suggestion "start a session on this". Sent once on open. */
  prompt?: string;
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
  return (
    <CesareContext.Provider value={value}>{children}</CesareContext.Provider>
  );
}

/**
 * Returns a stable `openCesare` callback that opens the Cesare sheet managed
 * by the nearest AppShell ancestor. Falls back to a no-op when used outside
 * an AppShell (e.g. in Storybook or isolated tests).
 *
 * Fails closed on `Features.AI_ENABLED`: every call site used to be
 * individually responsible for checking the flag before calling this, and
 * the one place that forgot (the shooting-plan dock's "Cesare" button) opened
 * the AI drawer even with AI fully disabled. The check lives here instead so
 * a future call site can't repeat that omission. `useOptionalFeature` returns
 * `null` (not `false`) when no `FeatureProvider` is mounted — that case still
 * opens, since there's no flag state to fail closed against.
 */
export function useCesareOpen(): (opts?: OpenCesareOptions) => void {
  const ctx = useContext(CesareContext);
  const isAiEnabled = useOptionalFeature(Features.AI_ENABLED);
  const noop = useCallback(() => undefined, []);
  if (isAiEnabled === false) return noop;
  return ctx?.openCesare ?? noop;
}
