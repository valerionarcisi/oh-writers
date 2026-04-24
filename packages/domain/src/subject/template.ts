import { SUBJECT_SECTIONS } from "./sections.js";

const HEADING_LABELS: Record<(typeof SUBJECT_SECTIONS)[number], string> = {
  premise: "Premise",
  protagonist: "Protagonist & antagonist",
  arc: "Narrative arc",
  world: "World",
  ending: "Ending",
};

export const SOGGETTO_INITIAL_TEMPLATE: string =
  SUBJECT_SECTIONS.map((s) => `## ${HEADING_LABELS[s]}`).join("\n\n") + "\n";
