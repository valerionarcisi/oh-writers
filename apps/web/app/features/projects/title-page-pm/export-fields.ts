/*
 * Extracts the text of every frontespizio region from the stored
 * `titlePageDoc` PM JSON so the PDF export can render the title page the
 * user actually wrote (BUG-N63: the export used to read only the legacy
 * `title_page_*` columns, which the live PM editor never writes).
 *
 * Pure and tolerant: invalid/missing JSON returns null and the caller
 * falls back to the legacy columns.
 */
import { Node as PMNode } from "prosemirror-model";
import { Result } from "neverthrow";
import { titlePageSchema } from "./schema";

export interface TitlePageDocFields {
  title: string;
  centerLines: readonly string[];
  footerLeftLines: readonly string[];
  footerCenterLines: readonly string[];
  footerRightLines: readonly string[];
}

const childrenOf = (node: PMNode): readonly PMNode[] =>
  Array.from({ length: node.childCount }, (_, index) => node.child(index));

const paragraphLines = (region: PMNode | undefined): readonly string[] =>
  region === undefined
    ? []
    : childrenOf(region)
        .map((para) => para.textContent.trim())
        .filter((text) => text.length > 0);

const fieldsFromNode = (doc: PMNode): TitlePageDocFields => {
  const regions = childrenOf(doc);
  const region = (name: string): PMNode | undefined =>
    regions.find((node) => node.type.name === name);

  return {
    title: region("title")?.textContent.trim() ?? "",
    centerLines: paragraphLines(region("centerBlock")),
    footerLeftLines: paragraphLines(region("footerLeft")),
    footerCenterLines: paragraphLines(region("footerCenter")),
    footerRightLines: paragraphLines(region("footerRight")),
  };
};

export const extractTitlePageExportFields = (
  docJson: unknown,
): TitlePageDocFields | null => {
  if (typeof docJson !== "object" || docJson === null) return null;
  const parseNode = Result.fromThrowable(() => {
    const node = PMNode.fromJSON(
      titlePageSchema,
      docJson as Record<string, unknown>,
    );
    node.check();
    return node;
  });
  const parsed = parseNode();
  return parsed.isErr() ? null : fieldsFromNode(parsed.value);
};
