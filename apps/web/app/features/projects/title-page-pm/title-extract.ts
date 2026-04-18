import { Node as PMNode } from "prosemirror-model";
import { titlePageSchema } from "./schema";

type DocLike = PMNode | { content?: unknown } | null | undefined;

const isPMNode = (value: unknown): value is PMNode =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  "textContent" in value;

const extractFromJson = (json: unknown): string => {
  if (typeof json !== "object" || json === null) return "";
  try {
    const node = PMNode.fromJSON(
      titlePageSchema,
      json as Record<string, unknown>,
    );
    return node.firstChild?.textContent.trim() ?? "";
  } catch {
    return "";
  }
};

export const extractTitle = (doc: DocLike): string => {
  if (!doc) return "";
  if (isPMNode(doc)) return doc.firstChild?.textContent.trim() ?? "";
  return extractFromJson(doc);
};
