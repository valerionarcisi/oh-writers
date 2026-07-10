import { createServerFn } from "@tanstack/start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
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
// fast slot, quality recent ↔ quality slot)." ONE function, no hardcoded
// model IDs — proven by a fixture test using fictional model ids.

export type RecommendedModels = {
  readonly fast: CatalogueModel;
  readonly quality: CatalogueModel;
};

const ANTHROPIC_PREFIX = "anthropic/";
// Anti-fossil window ONLY — generous on purpose (~18 months). A tight
// "recent releases" window is the wrong concept here: the price tiers ship on
// DIFFERENT cadences (a budget-tier model can be a year older than the
// newest flagship and still be the current budget generation — verified
// against the live catalogue, where a 120-day window left NO budget-class
// model and the whole recommended pair silently slid one tier up). The
// window's only job is dropping retired generations that providers keep
// listed.
const FOSSIL_WINDOW_SECONDS = 550 * 24 * 60 * 60;
// Anthropic price tiers are discrete and far apart (each step is ≥ ~2x on
// €/film). A gap ratio of 1.8 splits tiers without splitting same-tier
// sibling models (whose prices differ by well under 1.8x).
const PRICE_BAND_GAP_RATIO = 1.8;

// Group price-sorted models into bands: a new band starts where the price
// jumps by more than PRICE_BAND_GAP_RATIO from the previous model.
const splitIntoPriceBands = (
  byPriceAsc: readonly CatalogueModel[],
): CatalogueModel[][] => {
  const bands: CatalogueModel[][] = [];
  for (const model of byPriceAsc) {
    const band = bands[bands.length - 1];
    const previous = band?.[band.length - 1];
    if (
      band &&
      previous &&
      model.euroPerFeatureFilm <=
        previous.euroPerFeatureFilm * PRICE_BAND_GAP_RATIO
    ) {
      band.push(model);
    } else {
      bands.push([model]);
    }
  }
  return bands;
};

const newestOf = (band: readonly CatalogueModel[]): CatalogueModel =>
  band.reduce((a, b) => (b.created > a.created ? b : a));

export const selectRecommendedModels = (
  models: readonly OpenRouterModel[],
): RecommendedModels | null => {
  const anthropicModels = models
    .filter((m) => m.id.startsWith(ANTHROPIC_PREFIX))
    .map(withEstimate);

  if (anthropicModels.length === 0) return null;

  const newestCreated = Math.max(...anthropicModels.map((m) => m.created));
  const current = anthropicModels.filter(
    (m) => newestCreated - m.created <= FOSSIL_WINDOW_SECONDS,
  );

  const byPriceAsc = [...current].sort(
    (a, b) => a.euroPerFeatureFilm - b.euroPerFeatureFilm,
  );
  const bands = splitIntoPriceBands(byPriceAsc);

  const budgetBand = bands[0];
  if (!budgetBand) return null;
  // Fast slot = the NEWEST model of the cheapest price band; quality slot =
  // the NEWEST of the next band up. Bands (not a global recency sort) keep
  // each slot on its own tier: a brand-new flagship lands in a HIGHER band
  // and can never hijack either slot, and an older-but-current budget model
  // keeps its slot even when the newest releases are all premium-tier.
  const fast = newestOf(budgetBand);
  const qualityBand = bands[1];
  // Cap the quality slot at ~4.5x the fast-tier price: the Sonnet→Opus price
  // gap (~1.67x) is below the band split ratio, so band 2 can contain
  // flagship models too — without the cap, a flagship released after the
  // current balanced model would take the slot. Known ceiling: a flagship
  // priced within 4.5x of a future pricier budget tier could still slip
  // through; prices are always shown in the picker, so the failure mode is a
  // visible dearer default, never a hidden cost.
  const qualityCandidates = qualityBand?.filter(
    (m) => m.euroPerFeatureFilm <= fast.euroPerFeatureFilm * 4.5,
  );
  const quality =
    qualityCandidates && qualityCandidates.length > 0
      ? newestOf(qualityCandidates)
      : qualityBand
        ? newestOf(qualityBand)
        : fast;

  return { fast, quality };
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

// ─── Client-callable wrapper (manual-key wizard step, Wave 3) ─────────────
// The raw key is submitted here ONLY to run the one-shot validation probe —
// it is never persisted by this call (saveAiProvider, called separately on
// success, is what encrypts and stores it) and never echoed back in the
// response (`toShape(true)` carries no key material either way).

const ValidateProviderKeySchema = z.object({
  provider: z.enum(["openrouter", "anthropic"]),
  apiKey: z.string().min(1),
});

export const validateProviderKeyFn = createServerFn({ method: "POST" })
  .validator(ValidateProviderKeySchema)
  .handler(async ({ data }) => {
    await requireUser();
    return toShape(await validateProviderKey(data.provider, data.apiKey));
  });

// ─── queryOptions for TanStack Query (client) ──────────────────────────────

export const modelCatalogueQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-provider", "model-catalogue"],
    queryFn: () => getModelCatalogue(),
  });

export const recommendedModelsQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-provider", "recommended-models"],
    queryFn: () => getRecommendedModels(),
  });
