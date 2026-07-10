import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Db } from "~/server/db";

// Spec 84 (Wave 2) — resolveModelClient tests. The resolver's only external
// dependencies are `resolveAiProviderForUser` (DB + decrypt) and the two
// provider-factory functions (`anthropic`/`createAnthropic`/`createOpenRouter`).
// All three are mocked so these tests exercise the resolver's OWN branching
// (user-openrouter / user-anthropic / models-null / no-config / auth-failure
// classification) without touching a real DB or a real model call.

const resolveAiProviderForUserMock = vi.fn();

vi.mock("~/features/ai-providers/ai-providers.server", () => ({
  resolveAiProviderForUser: (...args: unknown[]) =>
    resolveAiProviderForUserMock(...args),
}));

const anthropicMock = vi.fn((modelId: string) => ({
  provider: "anthropic",
  modelId,
}));
const createAnthropicMock = vi.fn((opts: { apiKey: string }) =>
  vi.fn((modelId: string) => ({
    provider: "anthropic-byok",
    modelId,
    apiKey: opts.apiKey,
  })),
);

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: (modelId: string) => anthropicMock(modelId),
  createAnthropic: (opts: { apiKey: string }) => createAnthropicMock(opts),
}));

const createOpenRouterMock = vi.fn((opts: { apiKey: string }) =>
  vi.fn((modelId: string) => ({
    provider: "openrouter",
    modelId,
    apiKey: opts.apiKey,
  })),
);

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (opts: { apiKey: string }) => createOpenRouterMock(opts),
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_DB = {} as Db;
const ORIGINAL_ANTHROPIC_KEY = process.env["ANTHROPIC_API_KEY"];

beforeEach(() => {
  vi.clearAllMocks();
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform-key";
});

afterEach(() => {
  if (ORIGINAL_ANTHROPIC_KEY === undefined) {
    delete process.env["ANTHROPIC_API_KEY"];
  } else {
    process.env["ANTHROPIC_API_KEY"] = ORIGINAL_ANTHROPIC_KEY;
  }
});

const ok = <T>(value: T) => ({
  isOk: () => true,
  isErr: () => false,
  andThen: (f: (v: T) => unknown) => f(value),
  orElse: () => ok(value),
});
const errResult = <E>(error: E) => ({
  isOk: () => false,
  isErr: () => true,
  andThen: () => errResult(error),
  orElse: (f: (e: E) => unknown) => f(error),
});

describe("resolveModelClient", () => {
  it("no userId — resolves the platform client for the given tier without touching the DB", async () => {
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({ tier: "fast" });

    expect(resolveAiProviderForUserMock).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.source).toBe("platform");
    expect(result.value.modelId).toBe("claude-haiku-4-5-20251001");
    expect(anthropicMock).toHaveBeenCalledWith("claude-haiku-4-5-20251001");
  });

  it("userId with an openrouter provider and a chosen model — builds an OpenRouter client with the stored model", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      ok({
        provider: "openrouter",
        apiKey: "sk-or-v1-user-key",
        models: { fast: "meta/llama-haiku", quality: "anthropic/claude-x" },
      }),
    );
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "quality",
      db: FAKE_DB,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.source).toBe("user");
    expect(result.value.modelId).toBe("anthropic/claude-x");
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: "sk-or-v1-user-key",
    });
  });

  it("userId with an anthropic provider — builds a createAnthropic client with the user's key", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      ok({
        provider: "anthropic",
        apiKey: "sk-ant-user-key",
        models: { fast: "claude-haiku-user", quality: "claude-sonnet-user" },
      }),
    );
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "fast",
      db: FAKE_DB,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.source).toBe("user");
    expect(result.value.modelId).toBe("claude-haiku-user");
    expect(createAnthropicMock).toHaveBeenCalledWith({
      apiKey: "sk-ant-user-key",
    });
  });

  it("userId with an anthropic provider and NO chosen models yet — keeps the platform tier mapping (per spec §3)", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      ok({
        provider: "anthropic",
        apiKey: "sk-ant-user-key",
        models: null,
      }),
    );
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "fast",
      db: FAKE_DB,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.source).toBe("user");
    expect(result.value.modelId).toBe("claude-haiku-4-5-20251001");
  });

  it("userId with an openrouter provider and NO chosen models yet — typed AiModelsNotChosenError (sad path)", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      ok({
        provider: "openrouter",
        apiKey: "sk-or-v1-user-key",
        models: null,
      }),
    );
    const { resolveModelClient, AiModelsNotChosenError } =
      await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "fast",
      db: FAKE_DB,
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error).toBeInstanceOf(AiModelsNotChosenError);
    expect(result.error._tag).toBe("AiModelsNotChosenError");
  });

  it("userId with no provider configured — falls back to the platform client (transitional)", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      errResult({
        _tag: "AiProviderNotConfiguredError",
        message: "No AI provider configured for user",
      }),
    );
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "quality",
      db: FAKE_DB,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.source).toBe("platform");
    expect(result.value.modelId).toBe("claude-sonnet-5");
  });

  it("userId with a DB failure resolving the provider — surfaces the DbError, never silently falls back to platform", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      errResult({ _tag: "DbError", message: "connection refused" }),
    );
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "fast",
      db: FAKE_DB,
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("DbError");
  });

  it("userId with a crypto failure decrypting the stored key — surfaces the crypto error, never silently falls back to platform", async () => {
    resolveAiProviderForUserMock.mockReturnValue(
      errResult({
        _tag: "AiProviderCryptoError",
        message: "decryption failed: tampered or corrupt ciphertext",
      }),
    );
    const { resolveModelClient } = await import("./model-resolver.server");

    const result = await resolveModelClient({
      userId: USER_ID,
      tier: "fast",
      db: FAKE_DB,
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
  });
});

describe("isProviderAuthError", () => {
  it("classifies a 401 APICallError as a provider auth error", async () => {
    const { APICallError } = await import("ai");
    const { isProviderAuthError } = await import("./model-resolver.server");

    const error = new APICallError({
      message: "unauthorized",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 401,
    });

    expect(isProviderAuthError(error)).toBe(true);
  });

  it("classifies a 403 APICallError as a provider auth error", async () => {
    const { APICallError } = await import("ai");
    const { isProviderAuthError } = await import("./model-resolver.server");

    const error = new APICallError({
      message: "forbidden",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 403,
    });

    expect(isProviderAuthError(error)).toBe(true);
  });

  it("does not classify a 429 (rate limit) as a provider auth error", async () => {
    const { APICallError } = await import("ai");
    const { isProviderAuthError } = await import("./model-resolver.server");

    const error = new APICallError({
      message: "rate limited",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
    });

    expect(isProviderAuthError(error)).toBe(false);
  });

  it("does not classify a plain Error as a provider auth error", async () => {
    const { isProviderAuthError } = await import("./model-resolver.server");

    expect(isProviderAuthError(new Error("boom"))).toBe(false);
  });
});
