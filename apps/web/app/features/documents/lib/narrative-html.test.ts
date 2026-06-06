/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { canonicalNarrativeHtml, docToHtml, htmlToDoc } from "./narrative-html";
import { getNarrativeSchema } from "./narrative-schema";

describe("narrative-html", () => {
  describe("synopsis schema (no headings/lists)", () => {
    const schema = getNarrativeSchema(false);

    it("empty input → empty doc, serializes back to empty string", () => {
      const doc = htmlToDoc("", schema);
      expect(doc.childCount).toBe(1);
      expect(docToHtml(doc, schema)).toBe("");
    });

    it("plain text wrapped into paragraph", () => {
      const doc = htmlToDoc("hello world", schema);
      expect(docToHtml(doc, schema)).toBe("<p>hello world</p>");
    });

    it("multi-paragraph plain text → multiple <p>", () => {
      const doc = htmlToDoc("uno\n\ndue", schema);
      expect(docToHtml(doc, schema)).toBe("<p>uno</p><p>due</p>");
    });

    it("HTML round-trip preserves <p>", () => {
      const html = "<p>primo</p><p>secondo</p>";
      expect(docToHtml(htmlToDoc(html, schema), schema)).toBe(html);
    });

    it("drops headings + lists not present in synopsis schema", () => {
      const html = "<h2>title</h2><p>body</p><ul><li>item</li></ul>";
      const out = docToHtml(htmlToDoc(html, schema), schema);
      expect(out).not.toContain("<h2>");
      expect(out).not.toContain("<ul>");
      expect(out).toContain("body");
    });

    // Spec 65 — bold/italic marks round-trip so formatting persists on save.
    it("round-trips <strong> (bold)", () => {
      const html = "<p>un <strong>grassetto</strong> qui</p>";
      expect(docToHtml(htmlToDoc(html, schema), schema)).toBe(html);
    });

    it("round-trips <em> (italic)", () => {
      const html = "<p>un <em>corsivo</em> qui</p>";
      expect(docToHtml(htmlToDoc(html, schema), schema)).toBe(html);
    });

    it("normalises legacy <b>/<i> to <strong>/<em>", () => {
      const out = docToHtml(
        htmlToDoc("<p><b>x</b> <i>y</i></p>", schema),
        schema,
      );
      expect(out).toContain("<strong>x</strong>");
      expect(out).toContain("<em>y</em>");
    });
  });

  describe("treatment schema (headings + lists)", () => {
    const schema = getNarrativeSchema(true);

    it("preserves H2 and bullet list round-trip", () => {
      const html = "<h2>title</h2><p>intro</p><ul><li><p>one</p></li></ul>";
      const out = docToHtml(htmlToDoc(html, schema), schema);
      expect(out).toContain("<h2>title</h2>");
      expect(out).toContain("<p>intro</p>");
      expect(out).toContain("<ul>");
      expect(out).toContain("one");
    });

    it("simple <li> without <p> child still parses", () => {
      const html = "<ul><li>flat</li></ul>";
      const out = docToHtml(htmlToDoc(html, schema), schema);
      expect(out).toContain("<ul>");
      expect(out).toContain("flat");
    });
  });

  // Spec 61 — the autosave dirty-check canonicalises so a Cesare apply (plain
  // text in the DB) and its editor re-serialisation (HTML) are NOT dirty.
  describe("canonicalNarrativeHtml", () => {
    it("plain text and its <p> wrapping canonicalise to the same string", () => {
      expect(canonicalNarrativeHtml("Filippo", true)).toBe(
        canonicalNarrativeHtml("<p>Filippo</p>", true),
      );
    });

    it("multi-paragraph plain text equals its HTML form", () => {
      expect(canonicalNarrativeHtml("uno\n\ndue", true)).toBe(
        canonicalNarrativeHtml("<p>uno</p><p>due</p>", true),
      );
    });

    it("genuinely different text canonicalises differently", () => {
      expect(canonicalNarrativeHtml("Filippo", true)).not.toBe(
        canonicalNarrativeHtml("Marta", true),
      );
    });

    it("empty and whitespace canonicalise equal (both empty doc)", () => {
      expect(canonicalNarrativeHtml("", true)).toBe(
        canonicalNarrativeHtml("   ", true),
      );
    });
  });
});
