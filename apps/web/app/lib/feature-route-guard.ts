// apps/web/app/lib/feature-route-guard.ts
//
// Server-side route gate for a `beforeLoad`: redirects to the project home
// when the given feature is off. Pairs with the LeftRail/palette hiding done
// via `useFeature` — the feature-flags convention requires BOTH (OFF = hidden
// AND unreachable), so a nav entry disappearing is never the only guard.
import { redirect } from "@tanstack/react-router";
import {
  resolveFeatures,
  marketFromLocale,
  DEFAULT_PLAN,
  type Feature,
} from "@oh-writers/domain";

export async function requireFeature(
  feature: Feature,
  projectId: string,
): Promise<void> {
  const { resolveLocale } =
    await import("~/features/i18n/resolve-locale.server");
  const locale = await resolveLocale();
  const enabled = resolveFeatures({
    market: marketFromLocale(locale),
    plan: DEFAULT_PLAN,
    isDevEnvironment: import.meta.env.DEV,
  });
  if (!enabled.has(feature)) {
    throw redirect({ to: "/projects/$id", params: { id: projectId } });
  }
}
