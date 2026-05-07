import { describe, it, expect, beforeEach } from "vitest";
import { extractElements } from "./extract-elements.js";
import { _resetDictionaryCache } from "../dictionaries/index.js";

beforeEach(() => {
  _resetDictionaryCache();
});

describe("extractElements EN", () => {
  it("extracts physical artifacts from a sentence", async () => {
    const result = await extractElements({
      sceneText: "The dartboard hangs on the wall",
      locale: "en",
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const normalized = result.value.map((e) => e.normalized);
    expect(normalized).toContain("dartboard");
    expect(normalized).toContain("wall");
  });

  it("returns empty for abstract nouns only", async () => {
    const result = await extractElements({
      sceneText: "Stability. Integrity. Pride.",
      locale: "en",
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toHaveLength(0);
  });

  it("returns empty for V.O. stage direction without artifact nouns", async () => {
    const result = await extractElements({
      sceneText: "V.O.: Watch and learn.",
      locale: "en",
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toHaveLength(0);
  });
});

describe("extractElements IT", () => {
  it("extracts artifacts from an Italian sentence", async () => {
    const result = await extractElements({
      sceneText: "Una bottiglia di vino sul tavolo",
      locale: "it",
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const normalized = result.value.map((e) => e.normalized);
    expect(normalized).toContain("bottiglia");
    expect(normalized).toContain("vino");
    expect(normalized).toContain("tavolo");
  });
});

describe("extractElements unknown locale", () => {
  it("returns UnsupportedLocaleError", async () => {
    const result = await extractElements({
      sceneText: "A bottle on the table",
      // @ts-expect-error — testing runtime guard
      locale: "fr",
    });
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("UnsupportedLocaleError");
  });
});
