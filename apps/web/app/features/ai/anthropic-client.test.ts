import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTextMock = vi.fn();
const streamTextMock = vi.fn();

// Call counts must not leak between tests (several assert
// `toHaveBeenCalledTimes(1)`); `mockResolvedValue`/`mockReturnValue` are
// re-armed at the top of each test that needs them, so clearing (not
// resetting, which would also wipe those factory functions) is enough.
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: generateTextMock,
    streamText: streamTextMock,
  };
});

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn((model: string) => ({ modelId: model })),
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ modelId: model }))),
}));

vi.mock("~/server/langfuse-config", () => ({
  aiTelemetry: vi.fn(() => undefined),
}));

// Spec 83 (Wave 1) — callHaiku/streamGeneration now run the budget guard and
// record usage on every call. These tests exercise the AI SDK call shape,
// not the ledger, so both are mocked to hermetic no-ops (the ledger's own
// behaviour is covered by ai-usage.server.test.ts).
vi.mock("./ai-usage.server", () => ({
  checkDailyBudget: vi.fn(async () => ({
    isErr: () => false,
    isOk: () => true,
  })),
  recordAiUsage: vi.fn(async () => undefined),
  AiBudgetExceededError: class AiBudgetExceededError {
    readonly _tag = "AiBudgetExceededError" as const;
  },
}));

// Spec 84 (Wave 2) — callHaiku's userId path resolves through
// resolveModelClient. Mocked here so these tests stay focused on callHaiku's
// OWN wiring (does it call the resolver, does it use the resolved model) —
// the resolver's own branching is covered by model-resolver.server.test.ts.
const resolveModelClientMock = vi.fn();
vi.mock("./model-resolver.server", () => ({
  resolveModelClient: (...args: unknown[]) => resolveModelClientMock(...args),
  isProviderAuthError: vi.fn(() => false),
  AiProviderAuthError: class AiProviderAuthError {
    readonly _tag = "AiProviderAuthError" as const;
    constructor(
      readonly provider: string,
      readonly statusCode: number | undefined,
    ) {}
  },
  AiModelsNotChosenError: class AiModelsNotChosenError {
    readonly _tag = "AiModelsNotChosenError" as const;
    constructor(readonly userId: string) {}
  },
}));

describe("callHaiku — timeout/retry bound (BUG-101)", () => {
  it("passes an abortSignal and a bounded maxRetries to generateText", async () => {
    generateTextMock.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      finishReason: "stop",
    });
    const { callHaiku } = await import("./anthropic-client");

    await callHaiku(
      { system: "sys", fewShot: [], user: "hi", maxTokens: 100 },
      "test.op",
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const call = generateTextMock.mock.calls[0]?.[0];
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.maxRetries).toBe(1);
  });

  it("surfaces a stuck/timed-out call as a non-retryable AnthropicError instead of hanging", async () => {
    generateTextMock.mockRejectedValue(
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ),
    );
    const { callHaiku } = await import("./anthropic-client");

    const result = await callHaiku(
      { system: "sys", fewShot: [], user: "hi", maxTokens: 100 },
      "test.op",
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error._tag === "AnthropicError") {
      expect(result.error.retryable).toBe(false);
      expect(result.error.cause).toContain("timeout");
    }
  });
});

// Minimal ResultAsync-shaped fake: only the methods resolveCallModel/callHaiku
// actually invoke on the resolver's return value (`.mapErr`, `.andThen`, `then`
// for the final await inside ResultAsync.fromPromise's PromiseLike contract).
const fakeResolvedModelClientResult = (value: {
  model: unknown;
  modelId: string;
  source: "user" | "platform";
}) => ({
  mapErr: () => fakeResolvedModelClientResult(value),
  andThen: (f: (v: typeof value) => unknown) => f(value),
  then: (resolve: (v: { isOk: () => true; value: typeof value }) => unknown) =>
    Promise.resolve({ isOk: () => true as const, value }).then(resolve),
});

describe("callHaiku — BYOK model resolution (Spec 84 Wave 2)", () => {
  it("with a userId, resolves the model through resolveModelClient instead of building anthropic(model) directly", async () => {
    resolveModelClientMock.mockReturnValue(
      fakeResolvedModelClientResult({
        model: { modelId: "user-chosen-haiku" },
        modelId: "user-chosen-haiku",
        source: "user",
      }),
    );
    generateTextMock.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      finishReason: "stop",
    });
    const { callHaiku } = await import("./anthropic-client");

    await callHaiku(
      {
        system: "sys",
        fewShot: [],
        user: "hi",
        maxTokens: 100,
        userId: "user-1",
        tier: "fast",
      },
      "test.op",
    );

    expect(resolveModelClientMock).toHaveBeenCalledWith({
      userId: "user-1",
      tier: "fast",
      db: undefined,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const call = generateTextMock.mock.calls[0]?.[0];
    expect(call.model).toEqual({ modelId: "user-chosen-haiku" });
  });

  it("without a userId, never calls resolveModelClient — legacy path unchanged", async () => {
    generateTextMock.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      finishReason: "stop",
    });
    const { callHaiku } = await import("./anthropic-client");

    await callHaiku(
      { system: "sys", fewShot: [], user: "hi", maxTokens: 100 },
      "test.op",
    );

    expect(resolveModelClientMock).not.toHaveBeenCalled();
  });
});

// streamGeneration drains `fullStream` (not textStream) — mirror the AI SDK
// part shapes: `text-delta` parts carry `.text`, an `error` part carries `.error`.
// `usage`/`providerMetadata` are also read (post-drain, Spec 83 usage recording),
// so the fake must expose them just like the real streamText result does.
const fullStreamOf = (parts: ReadonlyArray<Record<string, unknown>>) => ({
  fullStream: (async function* () {
    for (const p of parts) yield p;
  })(),
  usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  providerMetadata: Promise.resolve(undefined),
});
const textParts = (chunks: readonly string[]) =>
  fullStreamOf(chunks.map((text) => ({ type: "text-delta", text })));

describe("streamGeneration (#103)", () => {
  it("invokes onDelta per chunk and returns the joined text", async () => {
    streamTextMock.mockReturnValue(
      textParts(["1. INT. ", "CASA - ", "GIORNO"]),
    );
    const { streamGeneration } = await import("./anthropic-client");

    const deltas: string[] = [];
    const result = await streamGeneration(
      { system: "sys", user: "soggetto", maxTokens: 3000 },
      "cesare.proposeScaletta",
      (t) => deltas.push(t),
    );

    expect(deltas).toEqual(["1. INT. ", "CASA - ", "GIORNO"]);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe("1. INT. CASA - GIORNO");
  });

  it("passes an abortSignal and a bounded maxRetries to streamText", async () => {
    streamTextMock.mockReturnValue(textParts(["x"]));
    const { streamGeneration } = await import("./anthropic-client");

    await streamGeneration(
      { system: "sys", user: "u", maxTokens: 100 },
      "test.op",
      () => {},
    );

    const call = streamTextMock.mock.calls.at(-1)?.[0];
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.maxRetries).toBe(1);
  });

  it("surfaces a mid-stream `error` part as an AnthropicError (fail-loud, not swallowed)", async () => {
    // The AI SDK's default onError only logs and lets fullStream continue; we
    // MUST re-throw the error part so a truncated generation is never returned
    // as a fake success.
    streamTextMock.mockReturnValue(
      fullStreamOf([
        { type: "text-delta", text: "partial" },
        { type: "error", error: new Error("stream broke") },
      ]),
    );
    const { streamGeneration } = await import("./anthropic-client");

    const result = await streamGeneration(
      { system: "sys", user: "u", maxTokens: 100 },
      "test.op",
      () => {},
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error._tag === "AnthropicError")
      expect(result.error.cause).toContain("stream broke");
  });

  it("composes the outer cancel signal with the timeout — aborting the turn aborts the model call (#103 leak fix)", async () => {
    streamTextMock.mockReturnValue(textParts(["x"]));
    const { streamGeneration } = await import("./anthropic-client");

    const outer = new AbortController();
    await streamGeneration(
      { system: "sys", user: "u", maxTokens: 100 },
      "test.op",
      () => {},
      outer.signal,
    );

    // The signal handed to streamText is a COMPOSITE (AbortSignal.any) of the
    // outer turn signal + the 45s timeout. Cancelling the turn must abort it, so
    // the in-flight generation tears down instead of leaking to its own timeout.
    const passed = streamTextMock.mock.calls.at(-1)?.[0].abortSignal;
    expect(passed).toBeInstanceOf(AbortSignal);
    expect(passed.aborted).toBe(false);
    outer.abort();
    expect(passed.aborted).toBe(true);
  });

  it("still applies the timeout when NO outer signal is given (unchanged path)", async () => {
    streamTextMock.mockReturnValue(textParts(["x"]));
    const { streamGeneration } = await import("./anthropic-client");

    await streamGeneration(
      { system: "sys", user: "u", maxTokens: 100 },
      "test.op",
      () => {},
    );

    const passed = streamTextMock.mock.calls.at(-1)?.[0].abortSignal;
    expect(passed).toBeInstanceOf(AbortSignal);
  });
});
