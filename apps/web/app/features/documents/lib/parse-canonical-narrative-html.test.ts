/**
 * @vitest-environment jsdom
 *
 * #92 — the strict server-side parser must round-trip EXACTLY the HTML our
 * own editor serialises (`docToHtml`), and refuse everything else. The
 * round-trip is the contract: for any doc the editor can produce,
 * parse(docToHtml(doc)) equals doc — so the server reseed encodes the same
 * ProseMirror content the client editor would.
 */
import { describe, expect, it } from "vitest";
import { docToHtml, htmlToDoc } from "./narrative-html";
import { getNarrativeSchema } from "./narrative-schema";
import { parseCanonicalNarrativeHtml } from "./parse-canonical-narrative-html";

const schema = getNarrativeSchema(true);

const roundTrip = (html: string) => {
  const doc = parseCanonicalNarrativeHtml(html);
  expect(doc, `parser accepted: ${html}`).not.toBeNull();
  return docToHtml(doc!, schema);
};

describe("parseCanonicalNarrativeHtml — round-trips docToHtml output", () => {
  it.each([
    "<p>Solo un paragrafo.</p>",
    "<p>Primo.</p><p>Secondo.</p>",
    "<p>riga uno<br>riga due</p>",
    "<p>Testo <strong>forte</strong> e <em>corsivo</em>.</p>",
    "<p><strong>Nid<em>ific</em>ato</strong></p>",
    "<h2>Atto I</h2><p>Scena.</p><h3>Beat</h3><p>Altro.</p>",
    "<ul><li><p>uno</p></li><li><p>due <strong>due</strong></p></li></ul>",
    "<p>escaped: &amp; &lt; &gt;</p>",
  ])("round-trips %s", (html) => {
    expect(roundTrip(html)).toBe(html);
  });

  it("round-trips what the EDITOR parses from user-style HTML (via htmlToDoc)", () => {
    // Simulate the real pipeline: arbitrary-ish input → editor doc →
    // canonical serialisation → server parse → identical canonical form.
    const editorDoc = htmlToDoc(
      "<p>Milano, <b>fine</b> anni Novanta.<br>Marta &amp; co.</p><h2>Atto</h2>",
      schema,
    );
    const canonical = docToHtml(editorDoc, schema);
    expect(roundTrip(canonical)).toBe(canonical);
  });

  it("decodes &nbsp; to U+00A0, the character innerHTML escaped", () => {
    const doc = parseCanonicalNarrativeHtml("<p>a&nbsp;b</p>");
    expect(doc).not.toBeNull();
    expect(doc!.textContent).toBe("a\u00a0b");
  });
});

describe("parseCanonicalNarrativeHtml — strict refusal (client-seed fallback)", () => {
  it.each([
    "plain text, not html",
    "<div>foreign block</div>",
    '<p class="x">attribute</p>',
    "<p><span>span</span></p>",
    "<p>unclosed",
    "<p>bad &unknown; entity</p>",
    "<li>orphan item</li>",
    "<ul></ul>",
    "<p><strong><strong>double mark</strong></strong></p>",
    "<h1>level not in schema</h1>",
  ])("returns null for %s", (html) => {
    expect(parseCanonicalNarrativeHtml(html)).toBeNull();
  });
});
