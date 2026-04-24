import { SUBJECT_SECTIONS, type SubjectSection } from "@oh-writers/domain";

export const SECTION_IT_LABELS: Record<SubjectSection, string> = {
  premise: "Premessa",
  protagonist: "Protagonista & antagonista",
  arc: "Arco narrativo",
  world: "Mondo",
  ending: "Finale",
};

const SECTION_EN_LABELS: Record<SubjectSection, string> = {
  premise: "Premise",
  protagonist: "Protagonist & antagonist",
  arc: "Narrative arc",
  world: "World",
  ending: "Ending",
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildHeadingRegex = (section: SubjectSection): RegExp => {
  const it = escapeRegex(SECTION_IT_LABELS[section]);
  const en = escapeRegex(SECTION_EN_LABELS[section]);
  return new RegExp(`^## (?:${it}|${en})\\s*$`, "im");
};

/**
 * Insert a generated section body under the matching Markdown heading.
 * Replaces any existing body between the heading and the next `## ` heading.
 * Returns the original content unchanged if the heading cannot be located —
 * the caller decides how to surface that (define-errors-out-of-existence).
 */
export const insertSectionBody = (
  content: string,
  section: SubjectSection,
  body: string,
): string => {
  const heading = buildHeadingRegex(section);
  const match = heading.exec(content);
  if (!match) return content;

  const headingStart = match.index;
  const headingEnd = headingStart + match[0].length;

  const afterHeading = content.slice(headingEnd);
  const nextHeadingRel = afterHeading.search(/\n## /m);
  const nextHeadingAbs =
    nextHeadingRel === -1 ? content.length : headingEnd + nextHeadingRel;

  const trimmedBody = body.trim();
  const before = content.slice(0, headingEnd);
  const after = content.slice(nextHeadingAbs);
  return `${before}\n\n${trimmedBody}\n\n${after.replace(/^\n+/, "")}`;
};

// Re-export for convenience of callers that want the canonical list.
export { SUBJECT_SECTIONS };
