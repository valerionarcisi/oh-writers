import { createServerFn } from "@tanstack/start";
import { ResultAsync, okAsync, ok, err } from "neverthrow";
import { toShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import {
  listModels,
  getKeyInfo,
  OpenRouterApiError,
  type OpenRouterModel,
} from "./openrouter-api.server";

// Spec 84 §3 — "no model ID is hardcoded anywhere in the UI or in defaults":
// the catalogue is always the live `GET /api/v1/models` response, and the
// "recommended" pair is a FILTER RULE evaluated against that live data, not
// a list. Only the token-count assumption and the pricing math below are
// code; every model id, name, and price comes from the fetch.

// ─── In-process cache (module Map — single instance is enough today; if we
// ever run multi-instance this becomes a shared cache, same tradeoff as
// Better Auth's optional Redis secondaryStorage) ───────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // ~1h, per spec §3

type CacheEntry = {
  readonly models: readonly OpenRouterModel[];
  readonly fetchedAt: number;
};

let cache: CacheEntry | null = null;

// Injectable clock so tests can control TTL expiry without real sleeps.
export const fetchModelCatalogue = (
  now: () => number = Date.now,
): ResultAsync<readonly OpenRouterModel[], OpenRouterApiError> => {
  const nowMs = now();
  if (cache && nowMs - cache.fetchedAt < CACHE_TTL_MS)
    return okAsync(cache.models);

  return listModels().andThen((models) => {
    cache = { models, fetchedAt: nowMs };
    return ok(models);
  });
};

// Test-only escape hatch — no other module should reach into cache state.
export const resetModelCatalogueCacheForTests = (): void => {
  cache = null;
};

// ─── €/feature-film estimate ────────────────────────────────────────────────
// Spec 84 §3 — "prices shown are computed from the catalogue's own pricing
// metadata, translated to €/feature-film". The token assumption is the ONE
// documented constant; everything else is derived from live pricing.
//
// Assumption: a feature-length screenplay generation workload (logline
// through full screenplay draft + revisions across a session) totals
// approximately 2,000,000 input tokens and 300,000 output tokens. This is a
// deliberately round, conservative planning number — not a metered average —
// used only to translate USD/token pricing into a single comparable figure
// for the model picker. Revisit if real usage data (the ai_usage ledger,
// Spec 83) shows a materially different shape.
export const FEATURE_FILM_TOKEN_ESTIMATE = {
  inputTokens: 2_000_000,
  outputTokens: 300_000,
} as const;

const USD_TO_EUR_RATE = 0.92; // approximate, documented planning constant

export const estimateEuroPerFeatureFilm = (
  pricing: OpenRouterModel["pricing"],
): number => {
  const promptUsd = Number.parseFloat(pricing.prompt);
  const completionUsd = Number.parseFloat(pricing.completion);
  const usd =
    promptUsd * FEATURE_FILM_TOKEN_ESTIMATE.inputTokens +
    completionUsd * FEATURE_FILM_TOKEN_ESTIMATE.outputTokens;
  return usd * USD_TO_EUR_RATE;
};

export type CatalogueModel = OpenRouterModel & {
  readonly euroPerFeatureFilm: number;
};

const withEstimate = (model: OpenRouterModel): CatalogueModel => ({
  ...model,
  euroPerFeatureFilm: estimateEuroPerFeatureFilm(model.pricing),
});

export const getModelCatalogue = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireUser();
    return toShape(
      await fetchModelCatalogue().map((models) => models.map(withEstimate)),
    );
  },
);

// ─── Recommended rule (Spec 84 §3) ─────────────────────────────────────────
// "The latest Anthropic-family models from the live catalogue, grouped into
// the two Cesare tiers by the catalogue's own pricing (cheapest recent ↔
// haiku slot, quality recent ↔ sonnet slot)." ONE function, no hardcoded
// model IDs — proven by a fixture test using fictional model ids.

export type RecommendedModels = {
  readonly haiku: CatalogueModel;
  readonly sonnet: CatalogueModel;
};

const ANTHROPIC_PREFIX = "anthropic/";
// "Latest" is a recency THRESHOLD relative to the newest release in the
// catalogue, not a fixed top-N count — a count alone doesn't exclude old
// models when the catalogue happens to be small (e.g. only 4 Anthropic
// models total: a fixed top-6 window would let a years-old model slip in as
// "recent" simply for lack of competition). A ~120-day gap from the newest
// release comfortably spans one Anthropic release cycle while still
// dropping clearly superseded generations.
const RECENCY_WINDOW_SECONDS = 120 * 24 * 60 * 60;

export const selectRecommendedModels = (
  models: readonly OpenRouterModel[],
): RecommendedModels | null => {
  const anthropicModels = models
    .filter((m) => m.id.startsWith(ANTHROPIC_PREFIX))
    .map(withEstimate);

  if (anthropicModels.length === 0) return null;

  const newestCreated = Math.max(...anthropicModels.map((m) => m.created));
  const mostRecent = anthropicModels.filter(
    (m) => newestCreated - m.created <= RECENCY_WINDOW_SECONDS,
  );

  const byPriceAsc = [...mostRecent].sort(
    (a, b) => a.euroPerFeatureFilm - b.euroPerFeatureFilm,
  );

  const haiku = byPriceAsc[0];
  if (!haiku) return null;
  // Quality slot = the NEXT distinct price tier up from the budget slot, not
  // the priciest of the range: the top of the range is flagship pricing
  // (Opus/Fable-class), and picking it would silently turn the recommended
  // default into a 3-5x-cost model the day a new flagship ships. Falls back
  // to the budget model itself when the catalogue has one price tier only.
  const sonnet =
    byPriceAsc.find((m) => m.euroPerFeatureFilm > haiku.euroPerFeatureFilm) ??
    haiku;

  return { haiku, sonnet };
};

export const getRecommendedModels = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireUser();
    return toShape(
      await fetchModelCatalogue().map((models) =>
        selectRecommendedModels(models),
      ),
    );
  },
);

// ─── Key validation (wizard step 3 + manual-key power-user path) ──────────

export class AnthropicKeyValidationError {
  readonly _tag = "AnthropicKeyValidationError" as const;
  readonly message: string;

  constructor(
    readonly status: number | null,
    detail: string,
  ) {
    this.message = `Anthropic key validation failed: ${detail}`;
  }
}

const ANTHROPIC_COUNT_TOKENS_URL =
  "https://api.anthropic.com/v1/messages/count_tokens";
const ANTHROPIC_VALIDATION_TIMEOUT_MS = 10_000;
// The count_tokens endpoint is free and requires no model spend — the
// smallest valid probe for "is this key live", per Spec 84 §2.4 (manual key)
// and §2.3 step 3 (wizard's post-connect validation).
const ANTHROPIC_PROBE_MODEL = "claude-haiku-4-5";
const ANTHROPIC_API_VERSION = "2023-06-01";

const validateAnthropicKey = (
  apiKey: string,
): ResultAsync<true, AnthropicKeyValidationError> =>
  ResultAsync.fromPromise(
    fetch(ANTHROPIC_COUNT_TOKENS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_PROBE_MODEL,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC_VALIDATION_TIMEOUT_MS),
    }),
    (e) =>
      new AnthropicKeyValidationError(
        null,
        e instanceof Error ? e.message : String(e),
      ),
  ).andThen((response) =>
    response.ok
      ? ok(true as const)
      : err(
          new AnthropicKeyValidationError(response.status, response.statusText),
        ),
  );

export type ProviderKeyValidationError =
  | OpenRouterApiError
  | AnthropicKeyValidationError;

export const validateProviderKey = (
  provider: "openrouter" | "anthropic",
  apiKey: string,
): ResultAsync<true, ProviderKeyValidationError> =>
  provider === "openrouter"
    ? getKeyInfo(apiKey).map(() => true as const)
    : validateAnthropicKey(apiKey);
