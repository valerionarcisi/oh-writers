import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatNumber,
  formatInteger,
  formatCurrencyEUR,
} from "./format.js";

// A fixed instant: 2026-04-13T14:05:00Z. Assertions avoid locale-byte-exactness
// (Intl output varies by ICU version) and instead assert the locale-discriminating
// properties that the N-20 fix exists to guarantee.
const DATE = new Date("2026-04-13T14:05:00Z");

describe("i18n format helpers", () => {
  it("formatDate differs by locale (month order/casing)", () => {
    expect(formatDate(DATE, "it")).not.toBe(formatDate(DATE, "en"));
    expect(formatDate(DATE, "it")).toContain("13");
  });

  it("formatTime renders hours and minutes", () => {
    expect(formatTime(DATE, "it")).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(formatTime(DATE, "en")).toMatch(/\d{1,2}:\d{2}/);
  });

  it("formatDateTime carries both day and time", () => {
    const it = formatDateTime(DATE, "it");
    expect(it).toContain("13");
    expect(it).toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it("formatNumber groups by locale", () => {
    expect(formatNumber(1234567, "it")).not.toBe(formatNumber(1234567, "en"));
  });

  it("formatInteger rounds and groups by locale", () => {
    // 1234.7 → rounds to 1235 (no fraction digits).
    expect(formatInteger(1234.7, "en")).toBe("1,235");
    // Italian groups at 7 digits (ICU does not group 4-digit it-IT numbers).
    expect(formatInteger(1234567, "it")).toBe("1.234.567");
    expect(formatInteger(1234567, "en")).toBe("1,234,567");
  });

  it("formatCurrencyEUR uses the euro symbol and rounds", () => {
    expect(formatCurrencyEUR(1234567.6, "it")).toContain("€");
    expect(formatCurrencyEUR(1234567.6, "it")).toContain("1.234.568");
    expect(formatCurrencyEUR(1234567.6, "en")).toContain("€");
    expect(formatCurrencyEUR(1234567.6, "en")).toContain("1,234,568");
  });
});
