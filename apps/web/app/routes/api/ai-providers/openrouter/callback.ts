import { createAPIFileRoute } from "@tanstack/start/api";
import { ResultAsync, err, ok } from "neverthrow";
import { getUserFromHeaders } from "~/server/context";
import { getDb } from "~/server/db";
import { logger } from "~/server/logger";
import { saveAiProviderForUser } from "~/features/ai-providers/ai-providers.server";
import {
  readPkceCookie,
  unpackPkceState,
  buildPkceCookieClearHeader,
} from "~/features/ai-providers/openrouter-pkce-state.server";
import { SETTINGS_ROUTE_PATH } from "~/features/ai-providers/openrouter-routes.const";

// Spec 84 §2.3 Step 3 — `GET /api/ai-providers/openrouter/callback` exchanges
// the OAuth `code` for a user-controlled API key and saves it via the
// existing `saveAiProviderForUser` (the same domain function the manual-key
// path uses). Failure paths redirect with a typed `?error=<code>` — never a
// secret, never the raw provider error body, in the URL or in logs.

const OPENROUTER_TOKEN_URL = "https://openrouter.ai/api/v1/auth/keys";
const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;

class OpenRouterTokenExchangeError {
  readonly _tag = "OpenRouterTokenExchangeError" as const;
  readonly message: string;
  constructor(
    readonly status: number | null,
    detail: string,
  ) {
    this.message = `OpenRouter token exchange failed: ${detail}`;
  }
}

const exchangeCodeForKey = (
  code: string,
  codeVerifier: string,
): ResultAsync<string, OpenRouterTokenExchangeError> =>
  ResultAsync.fromPromise(
    fetch(OPENROUTER_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: "S256",
      }),
      signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
    }),
    (e) =>
      new OpenRouterTokenExchangeError(
        null,
        e instanceof Error ? e.message : String(e),
      ),
  ).andThen((response) =>
    ResultAsync.fromPromise(
      response.json() as Promise<{ key?: string }>,
      (e) =>
        new OpenRouterTokenExchangeError(
          response.status,
          e instanceof Error ? e.message : String(e),
        ),
    ).andThen((body) => {
      if (!response.ok || !body.key)
        return err(
          new OpenRouterTokenExchangeError(
            response.status,
            "no key in response",
          ),
        );
      return ok(body.key);
    }),
  );

const redirectToSettings = (
  params: Record<string, string>,
  clearCookie: boolean,
): Response => {
  const url = new URL(SETTINGS_ROUTE_PATH, "http://internal.invalid");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    Location: `${url.pathname}${url.search}`,
  };
  if (clearCookie) headers["Set-Cookie"] = buildPkceCookieClearHeader();
  return new Response(null, { status: 302, headers });
};

export const APIRoute = createAPIFileRoute(
  "/api/ai-providers/openrouter/callback",
)({
  GET: async ({ request }) => {
    const user = await getUserFromHeaders(request.headers);
    if (!user) {
      return new Response("Unauthenticated", { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const oauthError = requestUrl.searchParams.get("error");
    if (oauthError) {
      logger.warn({ oauthError }, "openrouter.callback.provider_denied");
      return redirectToSettings({ error: "provider_denied" }, true);
    }
    if (!code) {
      return redirectToSettings({ error: "missing_code" }, true);
    }

    const packedState = readPkceCookie(request.headers.get("cookie"));
    if (!packedState) {
      return redirectToSettings({ error: "missing_state" }, false);
    }

    const verifierResult = unpackPkceState(packedState, user.id, Date.now());
    if (verifierResult.isErr()) {
      logger.warn(
        { tag: verifierResult.error._tag },
        "openrouter.callback.state_invalid",
      );
      return redirectToSettings({ error: "state_invalid" }, true);
    }

    const exchangeResult = await exchangeCodeForKey(code, verifierResult.value);
    if (exchangeResult.isErr()) {
      logger.error(
        { status: exchangeResult.error.status },
        "openrouter.callback.exchange_failed",
      );
      return redirectToSettings({ error: "exchange_failed" }, true);
    }

    const db = await getDb();
    const saveResult = await saveAiProviderForUser(db, user.id, {
      provider: "openrouter",
      apiKey: exchangeResult.value,
    });
    if (saveResult.isErr()) {
      logger.error(
        { tag: saveResult.error._tag },
        "openrouter.callback.save_failed",
      );
      return redirectToSettings({ error: "save_failed" }, true);
    }

    return redirectToSettings({ connected: "1" }, true);
  },
});
