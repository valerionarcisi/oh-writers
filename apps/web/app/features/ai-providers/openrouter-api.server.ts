import { ResultAsync, ok, err } from "neverthrow";
import { z } from "zod";

// Spec 84 §2.3 — thin wrappers over the OpenRouter HTTP API used by the
// connect wizard and the model catalogue. fetch-based, no SDK dependency.
// https://openrouter.ai/docs/api-reference

const REQUEST_TIMEOUT_MS = 10_000;
const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterApiError {
  readonly _tag = "OpenRouterApiError" as const;
  readonly message: string;

  constructor(
    readonly operation: string,
    readonly status: number | null,
    detail: string,
  ) {
    this.message = `OpenRouter API error in ${operation}: ${detail}`;
  }
}

const authedFetch = (
  operation: string,
  path: string,
  apiKey: string,
): ResultAsync<unknown, OpenRouterApiError> =>
  ResultAsync.fromPromise(
    fetch(`${OPENROUTER_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
    (e) => new OpenRouterApiError(operation, null, networkErrorDetail(e)),
  ).andThen((response) => parseJsonResponse(operation, response));

const networkErrorDetail = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const parseJsonResponse = (
  operation: string,
  response: Response,
): ResultAsync<unknown, OpenRouterApiError> =>
  ResultAsync.fromPromise(
    response.json(),
    (e) =>
      new OpenRouterApiError(operation, response.status, networkErrorDetail(e)),
  ).andThen((body) =>
    response.ok
      ? ok(body)
      : err(
          new OpenRouterApiError(
            operation,
            response.status,
            JSON.stringify(body),
          ),
        ),
  );

// ─── GET /api/v1/key — key limits and usage ────────────────────────────────

const KeyInfoResponseSchema = z.object({
  data: z.object({
    label: z.string(),
    limit: z.number().nullable(),
    limit_remaining: z.number().nullable(),
    usage: z.number(),
    is_free_tier: z.boolean(),
  }),
});

export type OpenRouterKeyInfo = {
  readonly label: string;
  readonly limit: number | null;
  readonly limitRemaining: number | null;
  readonly usage: number;
  readonly isFreeTier: boolean;
};

export const getKeyInfo = (
  apiKey: string,
): ResultAsync<OpenRouterKeyInfo, OpenRouterApiError> =>
  authedFetch("getKeyInfo", "/key", apiKey).andThen((body) => {
    const parsed = KeyInfoResponseSchema.safeParse(body);
    if (!parsed.success)
      return err(
        new OpenRouterApiError("getKeyInfo", null, "unexpected response shape"),
      );
    const { data } = parsed.data;
    return ok({
      label: data.label,
      limit: data.limit,
      limitRemaining: data.limit_remaining,
      usage: data.usage,
      isFreeTier: data.is_free_tier,
    });
  });

// ─── GET /api/v1/credits — account balance ─────────────────────────────────

const CreditsResponseSchema = z.object({
  data: z.object({
    total_credits: z.number(),
    total_usage: z.number(),
  }),
});

export type OpenRouterCredits = {
  readonly totalCredits: number;
  readonly totalUsage: number;
  readonly remaining: number;
};

export const getCredits = (
  apiKey: string,
): ResultAsync<OpenRouterCredits, OpenRouterApiError> =>
  authedFetch("getCredits", "/credits", apiKey).andThen((body) => {
    const parsed = CreditsResponseSchema.safeParse(body);
    if (!parsed.success)
      return err(
        new OpenRouterApiError("getCredits", null, "unexpected response shape"),
      );
    const { total_credits, total_usage } = parsed.data.data;
    return ok({
      totalCredits: total_credits,
      totalUsage: total_usage,
      remaining: total_credits - total_usage,
    });
  });

// ─── GET /api/v1/models — public live catalogue, no auth required ─────────
// Verified against the OpenRouter API reference (2026-07-10): the listing
// endpoint is public. We still isolate the call here so an auth requirement
// change is a one-line fix.

const ModelPricingSchema = z.object({
  prompt: z.string(),
  completion: z.string(),
});

const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  pricing: ModelPricingSchema,
});

const ModelsResponseSchema = z.object({
  data: z.array(ModelSchema),
});

export type OpenRouterModel = {
  readonly id: string;
  readonly name: string;
  readonly created: number;
  // Pricing is USD per token, as returned by OpenRouter — kept as strings to
  // avoid float precision loss; parsed to number only where computed.
  readonly pricing: {
    readonly prompt: string;
    readonly completion: string;
  };
};

export const listModels = (): ResultAsync<
  readonly OpenRouterModel[],
  OpenRouterApiError
> =>
  ResultAsync.fromPromise(
    fetch(`${OPENROUTER_API_BASE}/models`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
    (e) => new OpenRouterApiError("listModels", null, networkErrorDetail(e)),
  )
    .andThen((response) => parseJsonResponse("listModels", response))
    .andThen((body) => {
      const parsed = ModelsResponseSchema.safeParse(body);
      if (!parsed.success)
        return err(
          new OpenRouterApiError(
            "listModels",
            null,
            "unexpected response shape",
          ),
        );
      return ok(parsed.data.data);
    });
