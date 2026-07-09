import { APICallError, generateText, jsonSchema, tool as sdkTool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ResultAsync } from "neverthrow";
import { aiTelemetry } from "~/server/langfuse-config";

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

export const callHaiku = (
  params: CallHaikuParams,
  operation: string,
): ResultAsync<HaikuResult, AnthropicError> =>
  ResultAsync.fromPromise(
    generateText({
      model: anthropic(params.model ?? DEFAULT_MODEL),
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
    (e) => new AnthropicError(operation, e),
  );

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
