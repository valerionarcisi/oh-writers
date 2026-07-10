import {
  APICallError,
  generateText,
  jsonSchema,
  streamText,
  tool as sdkTool,
  type LanguageModel,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ResultAsync, errAsync } from "neverthrow";
import { aiTelemetry } from "~/server/langfuse-config";
import type { Db } from "~/server/db";
import {
  checkDailyBudget,
  recordAiUsage,
  AiBudgetExceededError,
  type AiUsageTrigger,
  type TokenUsage,
} from "./ai-usage.server";
import {
  resolveModelClient,
  isProviderAuthError,
  AiProviderAuthError,
  AiModelsNotChosenError,
  type AiProviderResolutionError,
} from "./model-resolver.server";
import type { ModelTier } from "~/features/predictions/cesare-model-router";

export { AiBudgetExceededError, AiProviderAuthError, AiModelsNotChosenError };
export type { AiUsageTrigger, AiProviderResolutionError };

const DEFAULT_MODEL = "claude-haiku-4-5";

// Classify a thrown model error as transient (worth retrying) vs terminal.
// The source of truth is the AI SDK's own `isRetryable` flag, which `APICallError`
// sets for rate-limit (429), request timeout (408), conflict (409) and 5xx — and
// clears for auth/validation (4xx). We also honour the same flag on any error
// object that carries it explicitly (e.g. a synthesised request-timeout cause),
// so retryability has one duck-typed contract. We never fabricate retryability
// for auth/validation: a 401/403/400 surfaces immediately, never retried
// (retrying only burns cost + latency on a request that cannot succeed).
// Anything without the flag is treated as terminal (fail fast) — we do not retry
// unknown failures blind.
export const isRetryableModelError = (error: unknown): boolean => {
  if (APICallError.isInstance(error)) return error.isRetryable === true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isRetryable?: unknown }).isRetryable === true
  );
};

export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly input_schema: Record<string, unknown>;
}

export interface ToolChoice {
  readonly type: "tool";
  readonly name: string;
}

export interface CallHaikuParams {
  readonly system: string;
  readonly fewShot: unknown;
  readonly user: string;
  readonly model?: string;
  readonly maxTokens: number;
  readonly tools?: ReadonlyArray<ToolDefinition>;
  readonly toolChoice?: ToolChoice;
  // Spec 83 (Wave 1) — who asked: an explicit user action vs an ambient
  // background flow. Feeds the daily budget guard (background flows are
  // hard-capped; user flows never blocked) and the usage ledger. Defaults to
  // "user" so existing callers are unaffected.
  readonly trigger?: AiUsageTrigger;
  // Spec 84 (Wave 2) — BYOK seam. When set together with `tier`, the call
  // resolves through `resolveModelClient` (user's own provider, or platform
  // fallback) instead of building `anthropic(model)` directly. Omitted
  // callers keep the legacy `model`-only behaviour unchanged.
  readonly userId?: string;
  readonly tier?: ModelTier;
  readonly db?: Db;
}

export interface TextBlock {
  readonly type: "text";
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: "tool_use";
  readonly name: string;
  readonly input: unknown;
}

export interface UnknownBlock {
  readonly type: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | UnknownBlock;

export interface HaikuResult {
  readonly content: ReadonlyArray<ContentBlock>;
  readonly stopReason: string | null;
}

export class AnthropicError {
  readonly _tag = "AnthropicError" as const;
  readonly message: string;
  readonly cause: string | null;
  // Whether the underlying model failure is transient (rate-limit / 5xx /
  // timeout) and therefore safe to retry. Classified ONCE here, at the SDK
  // boundary, where the original error object (with its status code) is still
  // available — downstream only sees this flag, never the raw error. Auth /
  // validation failures are never retryable. The retry policy on the AiClient
  // Layer (Spec 48 W-E3) reads this flag to decide whether to back off.
  readonly retryable: boolean;
  constructor(operation: string, cause: unknown) {
    this.message = `Anthropic call failed in ${operation}`;
    this.cause = cause instanceof Error ? cause.message : String(cause ?? "");
    this.retryable = isRetryableModelError(cause);
  }
}

// Spec 84 (Wave 2) — resolve the model client for a call:
//   - true legacy: neither `userId` nor `tier` set → build `anthropic(model)`
//     directly, byte-for-byte the pre-Spec-84 behaviour (never touches the
//     resolver, never queries the DB). This is the escape hatch for callers
//     that still pass a concrete model ID and nothing else.
//   - tier-aware: `tier` and/or `userId` set → go through `resolveModelClient`,
//     which resolves the user's own BYOK provider when `userId` is present,
//     or the platform tier mapping otherwise (`tier` defaults to "haiku",
//     callHaiku's own tier, when omitted alongside a `userId`).
const resolveCallModel = (
  params: Pick<CallHaikuParams, "model" | "userId" | "tier" | "db">,
  operation: string,
): ResultAsync<{ model: LanguageModel; modelId: string }, AnthropicError> => {
  if (!params.userId && !params.tier) {
    const modelId = params.model ?? DEFAULT_MODEL;
    return ResultAsync.fromSafePromise(
      Promise.resolve({ model: anthropic(modelId), modelId }),
    );
  }
  const tier: ModelTier = params.tier ?? "haiku";
  return resolveModelClient({
    userId: params.userId,
    tier,
    db: params.db,
  }).mapErr((e) => new AnthropicError(operation, `${e._tag}: ${e.message}`));
};

// Minimal typing for the streaming slice of the SDK used by llm-spoglio.
// The SDK's MessageStream.on("inputJson", ...) fires for each partial JSON
// delta from a tool_use block. finalMessage() resolves when the stream ends.
export interface MessageStream {
  on(event: "inputJson", listener: (delta: string) => void): this;
  finalMessage(): Promise<unknown>;
}

interface AnthropicStreamingMessagesClient {
  readonly messages: {
    stream(args: Record<string, unknown>): MessageStream;
  };
}

interface AnthropicStreamingConstructor {
  new (config: { apiKey: string }): AnthropicStreamingMessagesClient;
}

export const loadAnthropicStreamingClient =
  async (): Promise<AnthropicStreamingMessagesClient> => {
    if (process.env["MOCK_AI"] === "true") {
      const mock = await import("../predictions/_mocks/cesare-tool-loop.mock");
      return mock.createMockStreamingClient() as unknown as AnthropicStreamingMessagesClient;
    }
    const sdkModule = "@anthropic-ai/sdk";
    const sdk = (await import(/* @vite-ignore */ sdkModule)) as {
      default?: AnthropicStreamingConstructor;
    } & AnthropicStreamingConstructor;
    const Ctor = (sdk.default ?? sdk) as AnthropicStreamingConstructor;
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Set it in apps/web/.env or use MOCK_AI=true.",
      );
    }
    return new Ctor({ apiKey });
  };

const buildSdkTools = (
  defs: ReadonlyArray<ToolDefinition>,
): Record<string, ReturnType<typeof sdkTool>> =>
  Object.fromEntries(
    defs.map((t) => [
      t.name,
      sdkTool({
        description: t.description,
        inputSchema: jsonSchema(
          t.input_schema as Parameters<typeof jsonSchema>[0],
        ),
      }),
    ]),
  );

// BUG-101 — with no bound here, a stuck/retrying call blocks the outer
// tool-loop's streamText indefinitely (the loop can't progress past the tool
// call that invoked this) and keeps billing Anthropic even after the client
// gives up watching. 45s covers a real Sonnet generation with room to spare;
// maxRetries is set explicitly instead of trusting the SDK default so a
// transient-error retry storm can't silently add tens of seconds on its own.
const CALL_TIMEOUT_MS = 45_000;

// Normalises the AI SDK's usage/providerMetadata shape into the ledger's
// TokenUsage. Cached tokens live in two different places depending on SDK
// version/provider: `usage.cachedInputTokens` (normalised read count) and
// `providerMetadata.anthropic.cacheCreationInputTokens` (raw write count) —
// see the identical extraction in cesare-tools.ts's logCacheUsage.
const extractUsage = (
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  },
  providerMetadata:
    | { anthropic?: { cacheCreationInputTokens?: number } }
    | undefined,
): TokenUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  cacheReadTokens: usage.cachedInputTokens ?? 0,
  cacheWriteTokens: providerMetadata?.anthropic?.cacheCreationInputTokens ?? 0,
});

const runGenerateText = (
  params: CallHaikuParams,
  model: LanguageModel,
  modelId: string,
  operation: string,
): ResultAsync<HaikuResult, AnthropicError | AiProviderAuthError> =>
  ResultAsync.fromPromise(
    generateText({
      model,
      system: [
        {
          role: "system" as const,
          content: params.system,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
        {
          role: "system" as const,
          content: JSON.stringify(params.fewShot),
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
      ],
      // Cache the user turn too. The generators (scaletta / treatment /
      // screenplay from the same upstream material) embed up to 18k chars of
      // source text here and are frequently re-run on the same soggetto, so a
      // breakpoint turns those repeats into cache reads (~0.1x) and shaves the
      // re-processing latency. It silently no-ops for the small one-shot prompts
      // (below the model's minimum cacheable prefix), so it's free there.
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: params.user,
              providerOptions: {
                anthropic: { cacheControl: { type: "ephemeral" } },
              },
            },
          ],
        },
      ],
      maxOutputTokens: params.maxTokens,
      ...(params.tools && params.tools.length > 0
        ? {
            tools: buildSdkTools(params.tools),
            toolChoice: params.toolChoice
              ? { type: "tool" as const, toolName: params.toolChoice.name }
              : ("auto" as const),
          }
        : {}),
      experimental_telemetry: aiTelemetry(`call-haiku:${operation}`),
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      maxRetries: 1,
    }).then((result) => {
      // Fire-and-forget: recordAiUsage never rejects (fully guarded) and must
      // not add insert latency to the call path — review finding, Spec 83 W1.
      void recordAiUsage({
        operation,
        model: modelId,
        trigger: params.trigger ?? "user",
        usage: extractUsage(result.usage, result.providerMetadata),
        userId: params.userId,
      });
      const toolUseBlocks: ToolUseBlock[] = result.toolCalls.map((tc) => ({
        type: "tool_use" as const,
        name: tc.toolName,
        input: tc.input,
      }));
      const textBlock: TextBlock | null = result.text
        ? { type: "text" as const, text: result.text }
        : null;
      const content: ContentBlock[] = [
        ...(textBlock ? [textBlock] : []),
        ...toolUseBlocks,
      ];
      return {
        content,
        stopReason: result.finishReason ?? null,
      };
    }),
    // Spec 84 §6 — a user's own configured key that gets rejected (401/403)
    // surfaces as AiProviderAuthError, never a silent fallback to the
    // platform key. Every other failure keeps the existing AnthropicError
    // shape unchanged.
    (e) =>
      params.userId && isProviderAuthError(e)
        ? new AiProviderAuthError(
            "anthropic",
            APICallError.isInstance(e) ? e.statusCode : undefined,
          )
        : new AnthropicError(operation, e),
  );

export const callHaiku = (
  params: CallHaikuParams,
  operation: string,
): ResultAsync<
  HaikuResult,
  AnthropicError | AiBudgetExceededError | AiProviderAuthError
> => {
  const trigger: AiUsageTrigger = params.trigger ?? "user";
  return ResultAsync.fromPromise(
    checkDailyBudget(trigger),
    (e) => new AnthropicError(operation, e),
  ).andThen((budgetCheck) =>
    budgetCheck.isErr()
      ? errAsync(budgetCheck.error)
      : resolveCallModel(params, operation).andThen(({ model, modelId }) =>
          runGenerateText(params, model, modelId, operation),
        ),
  );
};

// #103 — streaming twin of callHaiku for the whole-document generators
// (scaletta / treatment / screenplay). callHaiku is BLOCKING: the tracer shows
// no progress for the ~40s the generation runs. streamGeneration uses streamText
// and invokes `onDelta` for each text chunk as it arrives, so the caller can
// forward tokens live. It is text-only (the generators never pass tools) and
// reuses callHaiku's user-turn cache breakpoint (the generators pass fewShot: []
// to callHaiku, so its second, empty fewShot system block is irrelevant here).
//
// It drains `fullStream`, NOT `textStream`, for two reasons the sibling loop
// already learned the hard way (BUG-101, cesare-tools.ts): (1) `textStream` can
// hang forever on a final step that yields no text deltas, whereas `fullStream`
// always emits a terminal `finish` and closes; (2) `streamText`'s DEFAULT
// onError only `console.error`s the error and lets `textStream` complete
// normally — so a mid-stream API failure would be SWALLOWED and we'd return the
// partial/empty text as a fake success. Re-throwing on the `error` part restores
// callHaiku's fail-loud contract: the failure surfaces as an AnthropicError.
export interface StreamGenerationParams {
  readonly system: string;
  readonly user: string;
  readonly model?: string;
  readonly maxTokens: number;
  // Spec 83 (Wave 1) — see CallHaikuParams.trigger. Defaults to "user".
  readonly trigger?: AiUsageTrigger;
  // Spec 84 (Wave 2) — see CallHaikuParams.userId/tier/db.
  readonly userId?: string;
  readonly tier?: ModelTier;
  readonly db?: Db;
}

const runStreamGeneration = (
  params: StreamGenerationParams,
  model: LanguageModel,
  modelId: string,
  operation: string,
  onDelta: (text: string) => void,
  abortSignal: AbortSignal | undefined,
): ResultAsync<string, AnthropicError | AiProviderAuthError> =>
  ResultAsync.fromPromise(
    (async () => {
      const timeoutSignal = AbortSignal.timeout(CALL_TIMEOUT_MS);
      const effectiveSignal = abortSignal
        ? AbortSignal.any([abortSignal, timeoutSignal])
        : timeoutSignal;
      const result = streamText({
        model,
        system: [
          {
            role: "system" as const,
            content: params.system,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
        ],
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: params.user,
                providerOptions: {
                  anthropic: { cacheControl: { type: "ephemeral" } },
                },
              },
            ],
          },
        ],
        maxOutputTokens: params.maxTokens,
        experimental_telemetry: aiTelemetry(`stream-generation:${operation}`),
        abortSignal: effectiveSignal,
        maxRetries: 1,
      });
      let text = "";
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          text += part.text;
          onDelta(part.text);
        } else if (part.type === "error") {
          // streamText's default onError only logs; without this the failure
          // would be swallowed and we'd return partial text as a fake success.
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error));
        }
      }
      // Usage/providerMetadata resolve once the stream has fully drained —
      // safe to await here since the fullStream loop above already ran to
      // completion (or threw on the `error` part, in which case we never
      // reach this line and nothing is recorded for a failed generation).
      const [usage, providerMetadata] = await Promise.all([
        result.usage,
        result.providerMetadata,
      ]);
      void recordAiUsage({
        operation,
        model: modelId,
        trigger: params.trigger ?? "user",
        usage: extractUsage(usage, providerMetadata),
        userId: params.userId,
      });
      return text;
    })(),
    (e) =>
      params.userId && isProviderAuthError(e)
        ? new AiProviderAuthError(
            "anthropic",
            APICallError.isInstance(e) ? e.statusCode : undefined,
          )
        : new AnthropicError(operation, e),
  );

export const streamGeneration = (
  params: StreamGenerationParams,
  operation: string,
  onDelta: (text: string) => void,
  // #103 — the outer turn's cancel signal (drawer closed / navigation / dropped
  // connection). Composed with the 45s timeout below via AbortSignal.any so a
  // cancelled turn tears the nested generation's model call down immediately
  // instead of leaking it to run — and keep billing — to its own timeout. Absent
  // on the non-streaming / test paths, where only the timeout applies (unchanged).
  abortSignal?: AbortSignal,
): ResultAsync<
  string,
  AnthropicError | AiBudgetExceededError | AiProviderAuthError
> => {
  const trigger: AiUsageTrigger = params.trigger ?? "user";
  return ResultAsync.fromPromise(
    checkDailyBudget(trigger),
    (e) => new AnthropicError(operation, e),
  ).andThen((budgetCheck) =>
    budgetCheck.isErr()
      ? errAsync(budgetCheck.error)
      : resolveCallModel(params, operation).andThen(({ model, modelId }) =>
          runStreamGeneration(
            params,
            model,
            modelId,
            operation,
            onDelta,
            abortSignal,
          ),
        ),
  );
};

const isTextBlock = (b: ContentBlock): b is TextBlock => b.type === "text";
const isToolUseBlock = (b: ContentBlock): b is ToolUseBlock =>
  b.type === "tool_use";

export const extractText = (
  content: ReadonlyArray<ContentBlock>,
): string | null => {
  const block = content.find(isTextBlock);
  return block ? block.text.trim() : null;
};

export const extractToolUse = (
  content: ReadonlyArray<ContentBlock>,
  toolName: string,
): unknown | null => {
  const block = content.find(
    (b): b is ToolUseBlock => isToolUseBlock(b) && b.name === toolName,
  );
  return block ? block.input : null;
};
