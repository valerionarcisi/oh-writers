import { APICallError } from "ai";
import type { LanguageModel } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { ResultAsync, ok, err, type Result } from "neverthrow";
import { DbError } from "@oh-writers/utils";
import type { Db } from "~/server/db";
import type { AiProviderCryptoError } from "~/features/ai-providers/crypto.server";
import type { ResolvedAiProvider } from "~/features/ai-providers/ai-providers.server";
import {
  FAST_TIER_MODEL,
  QUALITY_TIER_MODEL,
  type ModelTier,
} from "~/features/predictions/cesare-model-router";

// ⚠️ Bundle-boundary rule (live regression, gate 2026-07-10): this module is
// reachable from the CLIENT graph (client .tsx → predictions barrel →
// features/ai barrel → here). `@openrouter/ai-sdk-provider`, `getDb` and
// `ai-providers.server` (which drags better-auth server context) must
// therefore load LAZILY inside the functions that need them — a static
// import wedges the whole client bundle at module init and every suspense
// query on the page silently hangs. Same pattern as
// `loadAnthropicStreamingClient` in anthropic-client.ts.

// Spec 84 (Wave 2) — resolveModelClient is the single seam where a model call
// picks WHICH account pays: the signed-in user's own provider (BYOK) or the
// platform's Anthropic key. Every call path that knows its caller's userId
// should resolve through here instead of building an `anthropic(...)` model
// directly, so BYOK adoption is a one-function change per caller.
//
// Spec 84 §6 ("errors out of existence"): a user WITH a configured provider
// never silently falls back to the platform key — a decrypt failure, an
// unchosen model set, or an auth rejection from the provider all surface as a
// typed error the caller can match on and route to a "reconnect your AI
// account" UI state.

export type ModelSource = "user" | "platform";

export interface ResolvedModelClient {
  readonly model: LanguageModel;
  readonly modelId: string;
  readonly source: ModelSource;
}

// Spec 84 §3 — model choice is never hardcoded for a configured user; this
// error means the wizard's model-picker step (Wave 3 UI) hasn't run yet.
export class AiModelsNotChosenError {
  readonly _tag = "AiModelsNotChosenError" as const;
  readonly message: string;
  constructor(readonly userId: string) {
    this.message = `AI provider connected but no model chosen yet for user ${userId}`;
  }
}

// Spec 84 §6 — a configured user's key was rejected by the provider (revoked,
// expired, exhausted). Never retried on the platform key: that would silently
// move the user's cost back onto Oh Writers.
export class AiProviderAuthError {
  readonly _tag = "AiProviderAuthError" as const;
  readonly message: string;
  constructor(
    readonly provider: ResolvedAiProvider["provider"],
    readonly statusCode: number | undefined,
  ) {
    this.message = `AI provider rejected the stored key (provider=${provider}, status=${statusCode ?? "unknown"})`;
  }
}

export type AiProviderResolutionError =
  | DbError
  | AiProviderCryptoError
  | AiModelsNotChosenError;

export interface ResolveModelClientParams {
  readonly userId?: string;
  readonly tier: ModelTier;
  readonly db?: Db;
}

// Spec 84 §3 — platform fallback keeps the PRE-EXISTING tier→model mapping
// from cesare-model-router (the platform's own config, not a per-user
// choice). Spec 83 de-platform checkpoint removes this default once trial
// quota ships; until then it is the only source of truth when no user
// provider is configured.
const platformModelId = (tier: ModelTier): string =>
  tier === "fast" ? FAST_TIER_MODEL : QUALITY_TIER_MODEL;

// Spec 84 de-platform checkpoint removes this default once trial quota ships.
const buildPlatformClient = (tier: ModelTier): ResolvedModelClient => {
  const modelId = platformModelId(tier);
  return { model: anthropic(modelId), modelId, source: "platform" };
};

const buildUserClient = async (
  provider: ResolvedAiProvider,
  tier: ModelTier,
  userId: string,
): Promise<Result<ResolvedModelClient, AiModelsNotChosenError>> => {
  if (provider.provider === "anthropic") {
    // Spec 84 §3 — the anthropic BYOK path keeps the platform tier mapping
    // "for now" (per spec): the wizard's model-picker (Wave 3 UI) will store
    // a chosen model for this provider too; until then the account owner
    // still gets the current-generation model, just billed to their key.
    const modelId = provider.models?.[tier] ?? platformModelId(tier);
    const client = createAnthropic({ apiKey: provider.apiKey });
    return ok({ model: client(modelId), modelId, source: "user" });
  }

  // provider.provider === "openrouter"
  if (!provider.models) return err(new AiModelsNotChosenError(userId));
  const modelId = provider.models[tier];
  // Lazy: see the bundle-boundary rule at the top of this file.
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const client = createOpenRouter({ apiKey: provider.apiKey });
  return ok({ model: client(modelId), modelId, source: "user" });
};

export const resolveModelClient = (
  params: ResolveModelClientParams,
): ResultAsync<ResolvedModelClient, AiProviderResolutionError> => {
  if (!params.userId) {
    return ResultAsync.fromSafePromise(
      Promise.resolve(buildPlatformClient(params.tier)),
    );
  }

  const userId = params.userId;
  // Lazy imports (see bundle-boundary rule above) + fromPromise, not
  // fromSafePromise: both the dynamic imports and getDb() can reject, and
  // that must surface as a typed DbError — not an unhandled rejection
  // escaping the Result channel.
  return ResultAsync.fromPromise(
    (async () => {
      const [{ resolveAiProviderForUser }, db] = await Promise.all([
        import("~/features/ai-providers/ai-providers.server"),
        params.db ?? (await import("~/server/db")).getDb(),
      ]);
      return { resolveAiProviderForUser, db };
    })(),
    (e) => new DbError("resolveModelClient.setup", e),
  ).andThen(({ resolveAiProviderForUser, db }) =>
    resolveAiProviderForUser(userId, db)
      .andThen((provider) =>
        ResultAsync.fromSafePromise(
          buildUserClient(provider, params.tier, userId),
        ).andThen((result) => result),
      )
      .orElse((resolveError) =>
        // Spec 84 §6 — NOT_CONFIGURED is the one resolution failure that
        // legitimately falls back to the platform key (there is no user
        // config to have failed). Any other failure (DB down, decrypt
        // broken) is a real error and must surface, not silently downgrade
        // to platform billing.
        resolveError._tag === "AiProviderNotConfiguredError"
          ? ok(buildPlatformClient(params.tier))
          : err(resolveError),
      ),
  );
};

// Classify a thrown model-call error as a provider auth rejection (401/403)
// vs anything else. Callers that resolved a USER client use this to decide
// whether to surface AiProviderAuthError instead of the generic model error —
// see anthropic-client.ts's mapping at the call site (never retried, never
// silently re-issued against the platform key).
export const isProviderAuthError = (error: unknown): boolean => {
  if (!APICallError.isInstance(error)) return false;
  return error.statusCode === 401 || error.statusCode === 403;
};
