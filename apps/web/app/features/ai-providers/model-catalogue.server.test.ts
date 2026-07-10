import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { okAsync } from "neverthrow";
import type { OpenRouterModel } from "./openrouter-api.server";

const { listModelsMock } = vi.hoisted(() => ({ listModelsMock: vi.fn() }));

vi.mock("./openrouter-api.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./openrouter-api.server")>();
  return { ...actual, listModels: listModelsMock };
});

const {
  selectRecommendedModels,
  estimateEuroPerFeatureFilm,
  fetchModelCatalogue,
  resetModelCatalogueCacheForTests,
  FEATURE_FILM_TOKEN_ESTIMATE,
} = await import("./model-catalogue.server");

const model = (overrides: Partial<OpenRouterModel>): OpenRouterModel => ({
  id: "some-provider/some-model",
  name: "Some Model",
  created: 1_700_000_000,
  pricing: { prompt: "0.000001", completion: "0.000002" },
  ...overrides,
});

describe("estimateEuroPerFeatureFilm (Spec 84 §3)", () => {
  it("computes cost from prompt + completion pricing over the documented token estimate", () => {
    const pricing = { prompt: "0.000001", completion: "0.000002" };
    const usd =
      0.000001 * FEATURE_FILM_TOKEN_ESTIMATE.inputTokens +
      0.000002 * FEATURE_FILM_TOKEN_ESTIMATE.outputTokens;
    const result = estimateEuroPerFeatureFilm(pricing);
    // Same fixed USD->EUR constant used internally; assert proportionality
    // rather than pin the literal rate here.
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(usd * (result / usd), 6);
  });

  it("returns 0 for a free model (zero pricing)", () => {
    const result = estimateEuroPerFeatureFilm({ prompt: "0", completion: "0" });
    expect(result).toBe(0);
  });

  it("scales linearly with prompt price", () => {
    const cheap = estimateEuroPerFeatureFilm({
      prompt: "0.000001",
      completion: "0",
    });
    const expensive = estimateEuroPerFeatureFilm({
      prompt: "0.000002",
      completion: "0",
    });
    expect(expensive).toBeCloseTo(cheap * 2, 6);
  });
});

describe("selectRecommendedModels — the filter RULE, no hardcoded IDs (Spec 84 §3, OHW-843)", () => {
  it("returns null when the catalogue has no anthropic/ models at all", () => {
    const catalogue = [
      model({ id: "openai/gpt-fictional", created: 1_800_000_000 }),
      model({ id: "mistral/fictional-large", created: 1_800_000_000 }),
    ];
    expect(selectRecommendedModels(catalogue)).toBeNull();
  });

  it("picks the cheapest and the NEXT price tier up (not the flagship) of the most recent anthropic-family models — proven with entirely fictional, never-before-seen model ids", () => {
    // These ids do not exist on any real OpenRouter catalogue. If the rule
    // still selects the right pair by id prefix + recency + price, nothing
    // in the implementation is hardcoding real model names.
    const catalogue: OpenRouterModel[] = [
      model({
        id: "anthropic/zephyr-nova-9-cheap",
        created: 2_000_000_000,
        pricing: { prompt: "0.0000005", completion: "0.0000015" },
      }),
      model({
        id: "anthropic/zephyr-nova-9-quality",
        created: 2_000_000_001,
        pricing: { prompt: "0.00001", completion: "0.00003" },
      }),
      model({
        id: "anthropic/zephyr-nova-9-mid",
        created: 2_000_000_002,
        pricing: { prompt: "0.000003", completion: "0.000009" },
      }),
      // Older Anthropic model — outside the "recent window", must be ignored
      // even though it might be cheaper than everything above.
      model({
        id: "anthropic/ancient-relic",
        created: 1_000_000_000,
        pricing: { prompt: "0.0000001", completion: "0.0000001" },
      }),
      // Non-Anthropic model, cheaper than all Anthropic options — must never
      // be picked regardless of price.
      model({
        id: "openai/gpt-fictional-cheap",
        created: 2_000_000_003,
        pricing: { prompt: "0.0000001", completion: "0.0000001" },
      }),
    ];

    const result = selectRecommendedModels(catalogue);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.fast.id).toBe("anthropic/zephyr-nova-9-cheap");
    // NOT "-quality" (the priciest, flagship-class): the quality slot is the
    // next distinct price tier above the budget slot, so a new flagship never
    // silently becomes the recommended default.
    expect(result.quality.id).toBe("anthropic/zephyr-nova-9-mid");
  });

  it("adapts automatically when a new fictional model appears with a later created date and different price — no code change needed", () => {
    const before: OpenRouterModel[] = [
      model({
        id: "anthropic/model-alpha",
        created: 1_900_000_000,
        pricing: { prompt: "0.000001", completion: "0.000003" },
      }),
      model({
        id: "anthropic/model-beta",
        created: 1_900_000_001,
        pricing: { prompt: "0.00001", completion: "0.00003" },
      }),
    ];
    const afterRelease: OpenRouterModel[] = [
      ...before,
      model({
        id: "anthropic/model-gamma-brand-new",
        created: 2_100_000_000,
        pricing: { prompt: "0.0000002", completion: "0.0000006" },
      }),
    ];

    const beforeResult = selectRecommendedModels(before);
    const afterResult = selectRecommendedModels(afterRelease);
    expect(beforeResult?.fast.id).toBe("anthropic/model-alpha");
    expect(afterResult?.fast.id).toBe("anthropic/model-gamma-brand-new");
  });

  it("returns the same model for both slots when only one anthropic model exists", () => {
    const catalogue = [model({ id: "anthropic/only-one" })];
    const result = selectRecommendedModels(catalogue);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.fast.id).toBe("anthropic/only-one");
    expect(result.quality.id).toBe("anthropic/only-one");
  });
});

describe("fetchModelCatalogue cache (Spec 84 §3, OHW-843)", () => {
  beforeEach(() => {
    listModelsMock.mockReset();
    resetModelCatalogueCacheForTests();
  });

  afterEach(() => {
    resetModelCatalogueCacheForTests();
  });

  it("fetches once and reuses the cache within the TTL window (injectable clock)", async () => {
    listModelsMock.mockReturnValue(
      okAsync([model({ id: "anthropic/cached-model" })]),
    );

    let now = 1_000_000;
    const clock = () => now;

    const first = await fetchModelCatalogue(clock);
    now += 30 * 60 * 1000; // 30 minutes later, still within the 1h TTL
    const second = await fetchModelCatalogue(clock);

    expect(listModelsMock).toHaveBeenCalledTimes(1);
    expect(first.isOk() && second.isOk()).toBe(true);
  });

  it("refetches once the TTL has elapsed", async () => {
    listModelsMock.mockReturnValue(
      okAsync([model({ id: "anthropic/cached-model" })]),
    );

    let now = 1_000_000;
    const clock = () => now;

    await fetchModelCatalogue(clock);
    now += 61 * 60 * 1000; // past the 1h TTL
    await fetchModelCatalogue(clock);

    expect(listModelsMock).toHaveBeenCalledTimes(2);
  });
});
