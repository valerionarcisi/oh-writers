import { describe, expect, it } from "vitest";
import { marketFromLocale, isItalianMarket } from "./market.js";

describe("market", () => {
  it("maps it → it, en → intl", () => {
    expect(marketFromLocale("it")).toBe("it");
    expect(marketFromLocale("en")).toBe("intl");
  });

  it("isItalianMarket is true only for it", () => {
    expect(isItalianMarket("it")).toBe(true);
    expect(isItalianMarket("en")).toBe(false);
  });
});
