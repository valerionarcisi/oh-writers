import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCredits, getKeyInfo, listModels } from "./openrouter-api.server";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ORIGINAL_FETCH = global.fetch;

describe("OpenRouter API wrappers (Spec 84 §2.3, OHW-843)", () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  describe("getCredits", () => {
    it("parses total credits and usage into a remaining balance", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { total_credits: 10, total_usage: 3.5 } }),
        ) as unknown as typeof fetch;

      const result = await getCredits("test-key");
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value).toEqual({
        totalCredits: 10,
        totalUsage: 3.5,
        remaining: 6.5,
      });
    });

    it("sends the bearer auth header", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { total_credits: 0, total_usage: 0 } }),
        );
      global.fetch = fetchMock as unknown as typeof fetch;

      await getCredits("my-secret-key");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer my-secret-key");
    });

    it("returns a typed error on a non-2xx response", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "invalid key" }, 401),
        ) as unknown as typeof fetch;

      const result = await getCredits("bad-key");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error._tag).toBe("OpenRouterApiError");
      expect(result.error.status).toBe(401);
    });

    it("returns a typed error when the response shape is unexpected", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ unexpected: true }),
        ) as unknown as typeof fetch;

      const result = await getCredits("test-key");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error._tag).toBe("OpenRouterApiError");
    });

    it("returns a typed error on a network failure", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(
          new Error("network down"),
        ) as unknown as typeof fetch;

      const result = await getCredits("test-key");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error._tag).toBe("OpenRouterApiError");
      expect(result.error.message).toContain("network down");
    });
  });

  describe("getKeyInfo", () => {
    it("parses key limit and usage fields", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            label: "sk-or-...abcd",
            limit: 100,
            limit_remaining: 42,
            usage: 58,
            is_free_tier: false,
          },
        }),
      ) as unknown as typeof fetch;

      const result = await getKeyInfo("test-key");
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value).toEqual({
        label: "sk-or-...abcd",
        limit: 100,
        limitRemaining: 42,
        usage: 58,
        isFreeTier: false,
      });
    });

    it("accepts a null limit (unlimited key)", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            label: "unlimited",
            limit: null,
            limit_remaining: null,
            usage: 5,
            is_free_tier: false,
          },
        }),
      ) as unknown as typeof fetch;

      const result = await getKeyInfo("test-key");
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value.limit).toBeNull();
    });
  });

  describe("listModels", () => {
    it("parses the live catalogue without sending an auth header", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: "anthropic/claude-example",
              name: "Claude Example",
              created: 1700000000,
              pricing: { prompt: "0.000003", completion: "0.000015" },
            },
          ],
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await listModels();
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe("anthropic/claude-example");

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit?];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("returns a typed error when the catalogue response is malformed", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ nope: true }),
        ) as unknown as typeof fetch;

      const result = await listModels();
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error._tag).toBe("OpenRouterApiError");
    });
  });
});
