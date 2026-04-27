import { SUBJECT_SECTIONS } from "./sections.js";

// The canonical soggetto template ships with Italian headings because IT is
// the default runtime language (Spec 04f). The English labels remain
// recognised by the editor via `findSubjectHeadings` / `insertSectionBody`
// as a fallback when an older document was created before this default flip.
const HEADING_LABELS: Record<(typeof SUBJECT_SECTIONS)[number], string> = {
  premise: "Premessa",
  protagonist: "Protagonista & antagonista",
  arc: "Arco narrativo",
  world: "Mondo",
  ending: "Finale",
};

export const SOGGETTO_INITIAL_TEMPLATE: string =
  SUBJECT_SECTIONS.map((s) => `## ${HEADING_LABELS[s]}`).join("\n\n") + "\n";
