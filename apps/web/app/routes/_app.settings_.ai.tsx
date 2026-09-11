import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";
import { titleHead } from "~/lib/document-title";
import { AiSettingsPage } from "~/features/ai-providers";

// Spec 84 §2.3 (Wave 3) — the wizard's real destination. `?connected=1`
// arrives from the OAuth callback right after a successful key exchange;
// `?error=<code>` arrives from either the start or the callback route on a
// typed failure. Both are optional — a direct visit shows the plain
// disconnected/connected state with no banner.
const AiSettingsSearchSchema = z.object({
  connected: z.literal("1").optional(),
  error: z.string().optional(),
});

// No `Features.AI_ENABLED` route guard here, unlike every other AI-gated
// route: this page IS the mechanism that turns AI_ENABLED on (connecting a
// BYOK provider). Gating it behind "AI is already enabled" is a catch-22 —
// a user with no provider and no trial can never reach the wizard that
// would let them connect one. `AiSettingsPage` already handles all three
// states (disconnected/post-connect/connected) itself via the provider
// status query, so no route-level gate is needed for correctness.
export const Route = createFileRoute("/_app/settings_/ai")({
  head: () => titleHead("AI"),
  validateSearch: AiSettingsSearchSchema,
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
