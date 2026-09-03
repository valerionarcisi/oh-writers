import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";
import { Features } from "@oh-writers/domain";
import { titleHead } from "~/lib/document-title";
import { AiSettingsPage } from "~/features/ai-providers";
import { requireFeatureOrDashboard } from "~/lib/feature-route-guard";

// Spec 84 §2.3 (Wave 3) — the wizard's real destination. `?connected=1`
// arrives from the OAuth callback right after a successful key exchange;
// `?error=<code>` arrives from either the start or the callback route on a
// typed failure. Both are optional — a direct visit shows the plain
// disconnected/connected state with no banner.
const AiSettingsSearchSchema = z.object({
  connected: z.literal("1").optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_app/settings_/ai")({
  head: () => titleHead("AI"),
  validateSearch: AiSettingsSearchSchema,
  beforeLoad: () => requireFeatureOrDashboard(Features.AI_ENABLED),
  component: AiSettingsRoute,
});

const appRoute = getRouteApi("/_app");

function AiSettingsRoute() {
  const { user } = appRoute.useLoaderData();
  const search = Route.useSearch();
  return (
    <AiSettingsPage
      userId={user.id}
      connected={search.connected === "1"}
      errorCode={search.error ?? null}
    />
  );
}
