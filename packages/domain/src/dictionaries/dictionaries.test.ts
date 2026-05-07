import { describe, it, expect, beforeEach } from "vitest";
import { loadDictionary, _resetDictionaryCache } from "./index.js";

beforeEach(() => {
  _resetDictionaryCache();
});

describe("loadDictionary EN", () => {
  it("returns ok and contains expected artifacts", () => {
    const result = loadDictionary("en");
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.has("dartboard")).toBe(true);
    expect(result.value.has("helmet")).toBe(true);
    expect(result.value.has("tights")).toBe(true);
  });

  it("does not contain non-artifact words", () => {
    const result = loadDictionary("en");
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.has("the")).toBe(false);
    expect(result.value.has("stability")).toBe(false);
    expect(result.value.has("integrity")).toBe(false);
    expect(result.value.has("pride")).toBe(false);
  });
});

describe("loadDictionary IT", () => {
  it("returns ok and contains expected artifacts", () => {
    const result = loadDictionary("it");
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.has("bottiglia")).toBe(true);
    expect(result.value.has("tavolo")).toBe(true);
    expect(result.value.has("vino")).toBe(true);
  });

  it("does not contain non-artifact words", () => {
    const result = loadDictionary("it");
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.has("il")).toBe(false);
    expect(result.value.has("della")).toBe(false);
    expect(result.value.has("bello")).toBe(false);
  });
});

describe("loadDictionary unsupported", () => {
  it("returns UnsupportedLocaleError for unknown locale", () => {
    // @ts-expect-error — testing runtime guard
    const result = loadDictionary("fr");
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("UnsupportedLocaleError");
  });
});
