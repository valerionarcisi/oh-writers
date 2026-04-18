import {
  DOMParser,
  DOMSerializer,
  Node as PMNode,
  Schema,
} from "prosemirror-model";

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Parse an HTML string into a ProseMirror document for the given schema.
 * Tags not present in the schema are silently dropped (PM behavior).
 *
 * Empty / whitespace-only HTML returns an empty doc with one paragraph,
 * matching the screenplay editor's "empty state" feel.
 */
export const htmlToDoc = (html: string, schema: Schema): PMNode => {
  const trimmed = (html ?? "").trim();
  if (!trimmed) {
    return schema.node("doc", null, [schema.node("paragraph")]);
  }

  // SSR fallback: jsdom is not always present. Build an empty doc and let
  // the client-side hydration re-parse from the same string on mount.
  if (!isBrowser) {
    return schema.node("doc", null, [schema.node("paragraph")]);
  }

  // Plain text without tags → wrap in a paragraph so writers can keep typing.
  const isHtml = trimmed.startsWith("<");
  const source = isHtml
    ? trimmed
    : trimmed
        .split(/\n\n+/)
        .map(
          (p) =>
            `<p>${p
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\n/g, "<br>")}</p>`,
        )
        .join("");

  const container = document.createElement("div");
  container.innerHTML = source;
  return DOMParser.fromSchema(schema).parse(container);
};

/**
 * Serialize a ProseMirror document back to an HTML string. Empty docs
 * produce an empty string (the DB stores "" rather than "<p></p>") so the
 * existing "is the doc empty" checks across NarrativeEditor keep working.
 */
export const docToHtml = (doc: PMNode, schema: Schema): string => {
  if (!isBrowser) return "";
  if (doc.childCount === 0) return "";
  if (doc.childCount === 1) {
    const only = doc.firstChild;
    if (only && only.type.name === "paragraph" && only.content.size === 0) {
      return "";
    }
  }

  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
    doc.content,
  );
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
};
