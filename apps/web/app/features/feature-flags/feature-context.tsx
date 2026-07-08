import { createContext, useContext, type ReactNode } from "react";
import {
  resolveFeatures,
  marketFromLocale,
  DEFAULT_PLAN,
  type Feature,
  type Locale,
} from "@oh-writers/domain";

const FeatureContext = createContext<ReadonlySet<Feature> | null>(null);

/**
 * Provides the set of ENABLED features, resolved from the locale-derived market
 * (+ plan, today permissive) and the dev/prod stage. Both `locale` and
 * `isDevEnvironment` are server-resolved (root loader), so the feature set is
 * correct at first paint and for route guards — no flash, no client-only
 * resolution.
 */
export function FeatureProvider({
  locale,
  isDevEnvironment,
  children,
}: {
  locale: Locale;
  isDevEnvironment: boolean;
  children: ReactNode;
}) {
  const enabled = resolveFeatures({
    market: marketFromLocale(locale),
    plan: DEFAULT_PLAN,
    isDevEnvironment,
  });
  return (
    <FeatureContext.Provider value={enabled}>
      {children}
    </FeatureContext.Provider>
  );
}

const useEnabledFeatures = (): ReadonlySet<Feature> => {
  const ctx = useContext(FeatureContext);
  if (!ctx) throw new Error("useFeature must be used within a FeatureProvider");
  return ctx;
};

/** True when the feature is enabled for the current session. */
export const useFeature = (feature: Feature): boolean =>
  useEnabledFeatures().has(feature);

export const useFeatures = (): ReadonlySet<Feature> => useEnabledFeatures();
