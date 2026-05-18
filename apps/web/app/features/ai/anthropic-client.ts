import { ResultAsync } from "neverthrow";

// Minimal local types mirroring the slice of `@anthropic-ai/sdk` we use.
// The SDK is lazy-imported via a string identifier so it stays optional in
// MOCK_AI environments (CI, local dev without a key). Centralising the
// import here means callers never reach for `@anthropic-ai/sdk` directly
// and never need an `: any` escape hatch.

const DEFAULT_MODEL = "claude-haiku-4-5";

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
  constructor(operation: string, cause: unknown) {
    this.message = `Anthropic call failed in ${operation}`;
    this.cause = cause instanceof Error ? cause.message : String(cause ?? "");
  }
}

interface AnthropicMessagesClient {
  readonly messages: {
    create(args: Record<string, unknown>): Promise<{
      content: ReadonlyArray<ContentBlock>;
      stop_reason?: string | null;
    }>;
  };
}

interface AnthropicConstructor {
  new (config: { apiKey: string }): AnthropicMessagesClient;
}

// Minimal typing for the streaming slice of the SDK used by llm-spoglio.
// The SDK's MessageStream.on("inputJson", ...) fires for each partial JSON
// delta from a tool_use block. finalMessage() resolves when the stream ends.
export interface MessageStream {
  on(
    event: "inputJson",
    listener: (delta: string) => void,
  ): this;
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

const loadAnthropic = async (): Promise<AnthropicConstructor> => {
  const sdkModule = "@anthropic-ai/sdk";
  const sdk = (await import(/* @vite-ignore */ sdkModule)) as {
    default?: AnthropicConstructor;
  } & AnthropicConstructor;
  return (sdk.default ?? sdk) as AnthropicConstructor;
};

export const loadAnthropicStreamingClient =
  async (): Promise<AnthropicStreamingMessagesClient> => {
    if (process.env["MOCK_AI"] === "true") {
      const mock = await import(
        "../predictions/_mocks/cesare-tool-loop.mock"
      );
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

export const callHaiku = (
  params: CallHaikuParams,
  operation: string,
): ResultAsync<HaikuResult, AnthropicError> =>
  ResultAsync.fromPromise(
    (async (): Promise<HaikuResult> => {
      const apiKey = process.env["ANTHROPIC_API_KEY"];
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      const Anthropic = await loadAnthropic();
      const client = new Anthropic({ apiKey });
      const request: Record<string, unknown> = {
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens,
        system: [
          {
            type: "text",
            text: params.system,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: JSON.stringify(params.fewShot),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: params.user }],
      };
      if (params.tools) request["tools"] = params.tools;
      if (params.toolChoice) request["tool_choice"] = params.toolChoice;
      const response = await client.messages.create(request);
      return {
        content: response.content,
        stopReason: response.stop_reason ?? null,
      };
    })(),
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
