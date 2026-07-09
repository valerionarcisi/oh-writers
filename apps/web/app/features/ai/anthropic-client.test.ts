import { describe, it, expect, vi } from "vitest";

const generateTextMock = vi.fn();
const streamTextMock = vi.fn();

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
}));

vi.mock("~/server/langfuse-config", () => ({
  aiTelemetry: vi.fn(() => undefined),
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
    if (result.isErr()) {
      expect(result.error.retryable).toBe(false);
      expect(result.error.cause).toContain("timeout");
    }
  });
});

// streamGeneration drains `fullStream` (not textStream) — mirror the AI SDK
// part shapes: `text-delta` parts carry `.text`, an `error` part carries `.error`.
const fullStreamOf = (parts: ReadonlyArray<Record<string, unknown>>) => ({
  fullStream: (async function* () {
    for (const p of parts) yield p;
  })(),
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
    if (result.isErr()) expect(result.error.cause).toContain("stream broke");
  });
});
