import { describe, it, expect } from "vitest";
import {
  htmlToText,
  parseItalianDeadline,
  parseItalianAmount,
} from "./parsers";

describe("htmlToText", () => {
  it("strips tags and decodes common entities", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b></p>")).toBe("Hello world");
    expect(htmlToText("&amp;&lt;&gt;&quot;&#39;")).toBe(`&<>"'`);
  });

  it("removes script and style blocks entirely", () => {
    expect(htmlToText("<script>alert(1)</script>ok")).toBe("ok");
    expect(htmlToText("<style>a{}</style>ok")).toBe("ok");
  });

  it("returns empty string for null/undefined", () => {
    expect(htmlToText(null)).toBe("");
    expect(htmlToText(undefined)).toBe("");
  });

  it("collapses whitespace", () => {
    expect(htmlToText("<p>a</p>\n\n<p>b</p>")).toBe("a b");
  });
});

describe("parseItalianDeadline", () => {
  it("parses ISO date", () => {
    const r = parseItalianDeadline("scade il 2026-09-30");
    expect(r.date?.getUTCFullYear()).toBe(2026);
    expect(r.date?.getUTCMonth()).toBe(8);
    expect(r.date?.getUTCDate()).toBe(30);
  });

  it("parses dd/mm/yyyy", () => {
    const r = parseItalianDeadline("entro 30/09/2026");
    expect(r.date?.getUTCFullYear()).toBe(2026);
    expect(r.date?.getUTCMonth()).toBe(8);
  });

  it("parses dd-mm-yy with 2-digit year", () => {
    const r = parseItalianDeadline("scadenza 30-09-26");
    expect(r.date?.getUTCFullYear()).toBe(2026);
  });

  it("parses italian month name with year", () => {
    const r = parseItalianDeadline("entro il 30 settembre 2026");
    expect(r.date?.getUTCFullYear()).toBe(2026);
    expect(r.date?.getUTCMonth()).toBe(8);
    expect(r.date?.getUTCDate()).toBe(30);
  });

  it("parses italian month name without year (defaults to current)", () => {
    const r = parseItalianDeadline("entro il 30 settembre");
    expect(r.date).not.toBeNull();
    expect(r.date?.getUTCMonth()).toBe(8);
  });

  it("returns null date for unparseable strings, keeps original text", () => {
    const r = parseItalianDeadline("a fine anno");
    expect(r.date).toBeNull();
    expect(r.text).toBe("a fine anno");
  });

  it("returns nulls for empty input", () => {
    expect(parseItalianDeadline("")).toEqual({ date: null, text: null });
  });
});

describe("parseItalianAmount", () => {
  it("parses '€50.000' (italian thousands separator)", () => {
    const r = parseItalianAmount("€50.000");
    expect(r.max).toBe(50000);
  });

  it("parses 'fino a 100k'", () => {
    const r = parseItalianAmount("fino a 100k");
    expect(r.max).toBe(100000);
  });

  it("parses 'da €10.000 a €50.000' as a range", () => {
    const r = parseItalianAmount("da €10.000 a €50.000");
    expect(r.min).toBe(10000);
    expect(r.max).toBe(50000);
  });

  it("parses '50mila' and '2 milioni'", () => {
    expect(parseItalianAmount("50mila").max).toBe(50000);
    expect(parseItalianAmount("fino a 2 milioni").max).toBe(2000000);
  });

  it("rejects tiny noise values under 100", () => {
    const r = parseItalianAmount("8 luglio");
    expect(r.max).toBeNull();
  });

  it("returns all nulls on empty input", () => {
    expect(parseItalianAmount("")).toEqual({
      min: null,
      max: null,
      text: null,
    });
  });
});
