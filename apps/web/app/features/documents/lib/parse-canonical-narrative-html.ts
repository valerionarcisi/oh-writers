// Server-safe parser for the CANONICAL narrative HTML our own editor emits
// (#92 / BUG-N72 for HTML content). `docToHtml` serialises through the
// browser's DOMSerializer, so the vocabulary is closed and tiny:
//
//   block:  <p> · <h2> · <h3> · <ul><li>
//   inline: text · <br> · <strong> · <em>
//   entities innerHTML produces: &amp; &lt; &gt; &nbsp;
//
// This module rebuilds the ProseMirror doc from that subset WITHOUT a DOM, so
// the server (yjs-seed) can reseed `documents.yjs_state` for HTML content too
// — previously it bailed to null and the CRDT silently kept the stale text.
//
// STRICT by design: any tag, attribute, or malformed nesting outside the
// canonical output returns null and the caller falls back to the client-seed
// path (the pre-#92 status quo). Never guess on foreign HTML.
import type { Node as PMNode } from "prosemirror-model";
import { getNarrativeSchema } from "./narrative-schema";

interface TagToken {
  readonly kind: "open" | "close";
  readonly name: string;
}

interface TextToken {
  readonly kind: "text";
  readonly text: string;
}

type Token = TagToken | TextToken;

const KNOWN_TAGS = new Set(["p", "h2", "h3", "ul", "li", "br", "strong", "em"]);

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};

const decodeEntities = (raw: string): string | null => {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i] as string;
    if (ch !== "&") {
      out += ch;
      i += 1;
      continue;
    }
    const semi = raw.indexOf(";", i);
    if (semi === -1) return null;
    const entity = raw.slice(i, semi + 1);
    const decoded = ENTITIES[entity];
    if (decoded === undefined) return null;
    out += decoded;
    i = semi + 1;
  }
  return out;
};

/** Tokenize into open/close tags of the known set + decoded text runs.
 *  Returns null on any tag outside the canonical vocabulary, any attribute,
 *  or any undecodable entity. `<br>` is normalised to an open token. */
const tokenize = (html: string): Token[] | null => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      const text = decodeEntities(html.slice(i));
      if (text === null) return null;
      if (text.length > 0) tokens.push({ kind: "text", text });
      break;
    }
    if (lt > i) {
      const text = decodeEntities(html.slice(i, lt));
      if (text === null) return null;
      if (text.length > 0) tokens.push({ kind: "text", text });
    }
    const gt = html.indexOf(">", lt);
    if (gt === -1) return null;
    const rawTag = html.slice(lt + 1, gt);
    const isClose = rawTag.startsWith("/");
    const name = (isClose ? rawTag.slice(1) : rawTag)
      .replace(/\/$/, "")
      .toLowerCase();
    // Attributes (a space in the tag) are never emitted by our serializer.
    if (!KNOWN_TAGS.has(name) || /[\s=]/.test(name)) return null;
    tokens.push({ kind: isClose ? "close" : "open", name });
    i = gt + 1;
  }
  return tokens;
};

interface Cursor {
  readonly tokens: Token[];
  pos: number;
}

const peek = (c: Cursor): Token | undefined => c.tokens[c.pos];

/** Parse inline content until the given closing tag. Marks nest (strong/em in
 *  any order); block tags inside inline content are malformed → null. */
const parseInline = (
  c: Cursor,
  schema: ReturnType<typeof getNarrativeSchema>,
  closeTag: string,
  activeMarks: readonly string[],
): PMNode[] | null => {
  const out: PMNode[] = [];
  for (;;) {
    const token = peek(c);
    if (token === undefined) return null;
    if (token.kind === "text") {
      c.pos += 1;
      out.push(
        schema.text(
          token.text,
          activeMarks.map((m) => schema.marks[m]!.create()),
        ),
      );
      continue;
    }
    if (token.kind === "close") {
      if (token.name !== closeTag) return null;
      c.pos += 1;
      return out;
    }
    // open tag
    if (token.name === "br") {
      c.pos += 1;
      out.push(schema.node("hard_break"));
      continue;
    }
    if (token.name === "strong" || token.name === "em") {
      if (activeMarks.includes(token.name)) return null;
      c.pos += 1;
      const inner = parseInline(c, schema, token.name, [
        ...activeMarks,
        token.name,
      ]);
      if (inner === null) return null;
      out.push(...inner);
      continue;
    }
    return null;
  }
};

const parseBlocks = (
  c: Cursor,
  schema: ReturnType<typeof getNarrativeSchema>,
): PMNode[] | null => {
  const blocks: PMNode[] = [];
  while (c.pos < c.tokens.length) {
    const token = peek(c) as Token;
    if (token.kind === "text") {
      // Whitespace between blocks is tolerated; real text at block level is
      // not canonical output.
      if (token.text.trim().length > 0) return null;
      c.pos += 1;
      continue;
    }
    if (token.kind === "close") return null;
    if (token.name === "p" || token.name === "h2" || token.name === "h3") {
      c.pos += 1;
      const inline = parseInline(c, schema, token.name, []);
      if (inline === null) return null;
      if (token.name === "p") {
        blocks.push(schema.node("paragraph", null, inline));
      } else {
        const heading = schema.nodes["heading"];
        if (!heading) return null;
        blocks.push(
          heading.create({ level: token.name === "h2" ? 2 : 3 }, inline),
        );
      }
      continue;
    }
    if (token.name === "ul") {
      c.pos += 1;
      const listItem = schema.nodes["list_item"];
      const bulletList = schema.nodes["bullet_list"];
      if (!listItem || !bulletList) return null;
      const items: PMNode[] = [];
      for (;;) {
        const next = peek(c);
        if (next === undefined) return null;
        if (next.kind === "close" && next.name === "ul") {
          c.pos += 1;
          break;
        }
        if (next.kind !== "open" || next.name !== "li") return null;
        c.pos += 1;
        // Canonical <li> holds either bare inline content or nested <p>s —
        // the schema wants `paragraph block*`, so bare inline is wrapped.
        const first = peek(c);
        if (
          first !== undefined &&
          first.kind === "open" &&
          first.name === "p"
        ) {
          const paragraphs: PMNode[] = [];
          while (true) {
            const t = peek(c);
            if (t !== undefined && t.kind === "open" && t.name === "p") {
              c.pos += 1;
              const inline = parseInline(c, schema, "p", []);
              if (inline === null) return null;
              paragraphs.push(schema.node("paragraph", null, inline));
              continue;
            }
            break;
          }
          const closeLi = peek(c);
          if (
            closeLi === undefined ||
            closeLi.kind !== "close" ||
            closeLi.name !== "li"
          )
            return null;
          c.pos += 1;
          items.push(listItem.create(null, paragraphs));
        } else {
          const inline = parseInline(c, schema, "li", []);
          if (inline === null) return null;
          items.push(
            listItem.create(null, [schema.node("paragraph", null, inline)]),
          );
        }
      }
      if (items.length === 0) return null;
      blocks.push(bulletList.create(null, items));
      continue;
    }
    return null;
  }
  return blocks;
};

/**
 * Parse canonical narrative HTML (the exact `docToHtml` output) into a
 * ProseMirror doc on the headings-enabled schema (the superset every consumer
 * accepts — see yjs-seed). Returns null for anything outside the canonical
 * vocabulary so callers keep their existing fallback.
 */
export const parseCanonicalNarrativeHtml = (html: string): PMNode | null => {
  const trimmed = html.trim();
  if (!trimmed.startsWith("<")) return null;
  const tokens = tokenize(trimmed);
  if (tokens === null) return null;
  const schema = getNarrativeSchema(true);
  const cursor: Cursor = { tokens, pos: 0 };
  const blocks = parseBlocks(cursor, schema);
  if (blocks === null || blocks.length === 0) return null;
  try {
    const doc = schema.node("doc", null, blocks);
    doc.check();
    return doc;
  } catch {
    return null;
  }
};
