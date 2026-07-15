import { describe, expect, it } from "vitest";
import { findLenient, replaceLenient } from "./lenient-text-match";

describe("findLenient", () => {
  it("short-circuits on an exact match with a byte-precise span", () => {
    const hay = "Marco entra nel bar.";
    expect(findLenient(hay, "entra nel")).toEqual({ start: 6, end: 15 });
  });

  it("matches a straight-quote needle against typographic quotes", () => {
    const hay = "Disse: “non torno più” e uscì.";
    const m = findLenient(hay, '"non torno più"');
    expect(m).not.toBeNull();
    expect(hay.slice(m!.start, m!.end)).toBe("“non torno più”");
  });

  it("matches across &nbsp; and &amp; entities", () => {
    const hay = "Il bar&nbsp;centrale &amp; storico del paese";
    const m = findLenient(hay, "Il bar centrale & storico");
    expect(m).not.toBeNull();
    expect(hay.slice(m!.start, m!.end)).toBe(
      "Il bar&nbsp;centrale &amp; storico",
    );
  });

  it("matches across collapsed whitespace runs", () => {
    const hay = "Marco  entra\n nel bar";
    const m = findLenient(hay, "Marco entra nel bar");
    expect(m).toEqual({ start: 0, end: hay.length });
  });

  it("matches typographic entities (&rsquo;, &mdash;) against their plain forms", () => {
    const hay = "Non c&rsquo;era pi&ugrave; niente &mdash; solo silenzio";
    const m = findLenient(hay, "c'era");
    expect(m).not.toBeNull();
    expect(hay.slice(m!.start, m!.end)).toBe("c&rsquo;era");
    const d = findLenient(hay, "niente - solo");
    expect(d).not.toBeNull();
    expect(hay.slice(d!.start, d!.end)).toBe("niente &mdash; solo");
  });

  it("returns null when the needle is absent or empty", () => {
    expect(findLenient("abc", "xyz")).toBeNull();
    expect(findLenient("abc", "")).toBeNull();
  });
});

describe("replaceLenient", () => {
  it("replaces only the matched span, leaving surrounding bytes intact", () => {
    const hay = "Prima. Disse: “ciao” a tutti. Dopo.";
    const out = replaceLenient(hay, '"ciao"', '"addio"');
    expect(out).toBe('Prima. Disse: "addio" a tutti. Dopo.');
  });

  it("swallows the whole original whitespace run inside the span", () => {
    const out = replaceLenient("a  b c", "a b", "X");
    expect(out).toBe("X c");
  });

  it("returns null when nothing matches", () => {
    expect(replaceLenient("abc", "zzz", "y")).toBeNull();
  });

  it("escapes HTML specials in the replacement on the lenient path", () => {
    const hay = "conto x &amp; y chiuso";
    const out = replaceLenient(hay, "x & y", "a < b & c");
    expect(out).toBe("conto a &lt; b &amp; c chiuso");
  });

  it("keeps the replacement verbatim on the exact path", () => {
    expect(replaceLenient("a b c", "b", "<em>b</em>")).toBe("a <em>b</em> c");
  });

  it("fails closed on a partial multi-char fold match", () => {
    // '…' normalises to '...'; a needle claiming only 2 of the 3 dots must
    // not swallow the whole original character.
    expect(findLenient("ciao… fine", ".. fine")).toBeNull();
    expect(replaceLenient("ciao… fine", ".. fine", "X")).toBeNull();
  });
});
