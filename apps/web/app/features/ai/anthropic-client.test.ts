import { describe, it, expect, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: generateTextMock,
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
