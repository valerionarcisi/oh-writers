import { createAPIFileRoute } from "@tanstack/start/api";
import { getUserFromHeaders } from "~/server/context";
import { logger } from "~/server/logger";
import {
  generateVerifier,
  challengeS256,
  buildAuthUrl,
} from "~/features/ai-providers/openrouter-pkce.server";
import {
  packPkceState,
  buildPkceCookieHeader,
} from "~/features/ai-providers/openrouter-pkce-state.server";
import { SETTINGS_ROUTE_PATH } from "~/features/ai-providers/openrouter-routes.const";

// Spec 84 §2.3 Step 2 — `GET /api/ai-providers/openrouter/start` kicks off
// the OAuth PKCE (S256) redirect to openrouter.ai. Session-gated: only a
// logged-in Oh Writers user can begin a connection. The verifier is held
// server-side (encrypted cookie, see openrouter-pkce-state.server.ts) bound
// to the requesting user, never sent to the browser as retrievable state.
//
// `requireUser()`/`getWebRequest()` are not reliably populated inside a raw
// API route handler (documented, previously-hit bug — see
// routes/api/cesare/stream.ts) — resolve from the request's OWN headers via
// `getUserFromHeaders`, the established pattern for this exact situation.
export const APIRoute = createAPIFileRoute(
  "/api/ai-providers/openrouter/start",
)({
  GET: async ({ request }) => {
    const user = await getUserFromHeaders(request.headers);
    if (!user) {
      return new Response("Unauthenticated", { status: 401 });
    }

    const verifier = generateVerifier();
    const challenge = challengeS256(verifier);
    const callbackUrl = new URL(
      "/api/ai-providers/openrouter/callback",
      request.url,
    ).toString();

    const packedState = packPkceState(user.id, verifier, Date.now());
    if (packedState.isErr()) {
      logger.error(
        { tag: packedState.error._tag },
        "openrouter.start.pack_state_failed",
      );
      return Response.redirect(
        `${SETTINGS_ROUTE_PATH}?error=connection_failed`,
        302,
      );
    }

    const authUrl = buildAuthUrl(callbackUrl, challenge);

    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl,
        "Set-Cookie": buildPkceCookieHeader(packedState.value),
      },
    });
  },
});
