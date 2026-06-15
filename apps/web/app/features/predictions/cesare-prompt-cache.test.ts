import { describe, it, expect } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { withCachedTools } from "./cesare-tools";

// Cost-smoke: the Anthropic prompt-cache breakpoint is byte-fragile. A reorder
// or a clobbered providerOptions silently drops the hit rate to zero and bills
// full price with no error. These pure-function tests lock the contract the
// tool-array breakpoint depends on:
//   1. exactly ONE breakpoint, on the LAST tool (Anthropic caches up to it);
//   2. order is preserved (cache requires a byte-identical prefix);
//   3. the caller's input is never mutated;
//   4. a pre-existing providerOptions (incl. an anthropic.* hint) is merged,
//      not replaced.
// Anthropic caps a request at 4 breakpoints; this tool slot is one of them (see
// the comment on withCachedTools). The live read-hit assertion lives in the
// Cesare cost-smoke E2E; this guards the structure it relies on.

const EPHEMERAL = {
  anthropic: { cacheControl: { type: "ephemeral" } },
};

const makeTool = (description: string) =>
  tool({ description, inputSchema: z.object({}) });

describe("withCachedTools — tool-array cache breakpoint", () => {
  it("marks only the LAST tool with the ephemeral cache breakpoint", () => {
    const input = { a: makeTool("a"), b: makeTool("b"), c: makeTool("c") };
    const out = withCachedTools(input);

    const opts = (t: unknown) =>
      (t as { providerOptions?: Record<string, unknown> }).providerOptions;
    expect(opts(out["a"])).toBeUndefined();
    expect(opts(out["b"])).toBeUndefined();
    expect(opts(out["c"])).toEqual(EPHEMERAL);
  });

  it("preserves tool order (cache needs a byte-identical prefix)", () => {
    const input = { first: makeTool("1"), second: makeTool("2") };
    expect(Object.keys(withCachedTools(input))).toEqual(["first", "second"]);
  });

  it("merges the breakpoint into existing providerOptions, not replacing them", () => {
    const base = makeTool("z");
    const withExisting = {
      ...base,
      providerOptions: { openai: { reasoningEffort: "low" } },
    };
    const out = withCachedTools({ only: withExisting });
    expect(
      (out["only"] as { providerOptions?: Record<string, unknown> })
        .providerOptions,
    ).toEqual({
      openai: { reasoningEffort: "low" },
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });

  it("deep-merges a pre-existing anthropic.* hint rather than clobbering it", () => {
    const base = makeTool("z");
    const withAnthropic = {
      ...base,
      providerOptions: { anthropic: { someFutureHint: true } },
    };
    const out = withCachedTools({ only: withAnthropic });
    expect(
      (out["only"] as { providerOptions?: Record<string, unknown> })
        .providerOptions?.["anthropic"] as Record<string, unknown>,
    ).toEqual({
      someFutureHint: true,
      cacheControl: { type: "ephemeral" },
    });
  });

  it("does not mutate the caller's tool map", () => {
    const input = { a: makeTool("a"), b: makeTool("b") };
    withCachedTools(input);
    expect(
      (input.b as { providerOptions?: unknown }).providerOptions,
    ).toBeUndefined();
  });

  it("returns the input untouched when there are no tools", () => {
    const input = {};
    expect(withCachedTools(input)).toBe(input);
  });
});
