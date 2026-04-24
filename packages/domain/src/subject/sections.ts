export const SUBJECT_SECTIONS = [
  "premise",
  "protagonist",
  "arc",
  "world",
  "ending",
] as const;

export type SubjectSection = (typeof SUBJECT_SECTIONS)[number];

export const isSubjectSection = (v: string): v is SubjectSection =>
  (SUBJECT_SECTIONS as readonly string[]).includes(v);
