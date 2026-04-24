import type { Node as PMNode } from "prosemirror-model";
import { SUBJECT_SECTIONS, type SubjectSection } from "@oh-writers/domain";
import { SECTION_IT_LABELS } from "./subject-insert";

const SECTION_EN_LABELS: Record<SubjectSection, string> = {
  premise: "Premise",
  protagonist: "Protagonist & antagonist",
  arc: "Narrative arc",
  world: "World",
  ending: "Ending",
};

export interface HeadingPosition {
  readonly pos: number;
  readonly section: SubjectSection;
  readonly label: string;
}

const buildReverseLookup = (): ReadonlyMap<string, SubjectSection> => {
  const map = new Map<string, SubjectSection>();
  for (const s of SUBJECT_SECTIONS) {
    map.set(SECTION_IT_LABELS[s].toLowerCase(), s);
    map.set(SECTION_EN_LABELS[s].toLowerCase(), s);
  }
  return map;
};

const LOOKUP = buildReverseLookup();

const matchSection = (text: string): SubjectSection | null => {
  const normalized = text
    .trim()
    .replace(/^#+\s*/, "")
    .toLowerCase();
  return LOOKUP.get(normalized) ?? null;
};

/**
 * Walks a ProseMirror doc and returns one entry per level-2 heading that
 * maps to a canonical SubjectSection. Also recognises markdown-style
 * "## Section" paragraphs (for schemas without a heading node type).
 */
export const findSubjectHeadings = (
  doc: PMNode,
): ReadonlyArray<HeadingPosition> => {
  const result: HeadingPosition[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs["level"] === 2) {
      const section = matchSection(node.textContent);
      if (section) {
        result.push({ pos, section, label: node.textContent });
      }
      return false;
    }
    if (node.type.name === "paragraph") {
      const text = node.textContent;
      if (text.startsWith("## ")) {
        const section = matchSection(text);
        if (section) {
          result.push({ pos, section, label: text });
        }
      }
      return false;
    }
    return true;
  });
  return result;
};
