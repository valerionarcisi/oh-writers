import type { FundraisingOpportunityOutput } from "../fundraising.schema";

export interface ClassifyFixture {
  readonly titleRegex: RegExp;
  readonly output: FundraisingOpportunityOutput;
}

export const CLASSIFY_MOCK_FIXTURES: ReadonlyArray<ClassifyFixture> = [
  {
    titleRegex: /bando|fondo|contribut|sovvenzion|finanziament|grant/i,
    output: {
      kind: "bando_pubblico",
      title: "Bando per la produzione cinematografica indipendente",
      summary:
        "Fondo a sostegno di opere cinematografiche di finzione prodotte da società italiane indipendenti. Finanzia fino al 50% del budget totale.",
      organization: "MiC – Direzione Generale Cinema",
      deadline_text: "31 marzo 2026",
      deadline_at: "2026-03-31T23:59:59.000Z",
      amount_min: 50000,
      amount_max: 500000,
      amount_text: "da 50.000 a 500.000 euro",
      eligibility: {
        formats: ["feature", "short"],
        genres: ["drama", "documentary", "comedy"],
        regions: ["Italia"],
        career_stage: ["emerging", "established"],
      },
      requirements:
        "Società di produzione italiana, opera prima o seconda lungometraggio.",
      link: "https://example.com/bando-mic-2026",
      confidence: 0.92,
    },
  },
  {
    titleRegex: /editoriale|rubrica|intervista|recensione|analisi|opinione/i,
    output: {
      kind: "other",
      title: "Editoriale: il cinema italiano nel 2025",
      summary: "",
      organization: null,
      deadline_text: null,
      deadline_at: null,
      amount_min: null,
      amount_max: null,
      amount_text: null,
      eligibility: {
        formats: [],
        genres: [],
        regions: [],
        career_stage: [],
      },
      requirements: null,
      link: "https://example.com/editoriale",
      confidence: 0,
    },
  },
];

/**
 * Returns the first fixture whose titleRegex matches the given title, or a
 * generic "other" fallback when nothing matches.
 */
export const findMockFixture = (
  title: string,
): FundraisingOpportunityOutput => {
  const match = CLASSIFY_MOCK_FIXTURES.find((f) => f.titleRegex.test(title));
  if (match) return match.output;
  return {
    kind: "other",
    title,
    summary: "",
    organization: null,
    deadline_text: null,
    deadline_at: null,
    amount_min: null,
    amount_max: null,
    amount_text: null,
    eligibility: { formats: [], genres: [], regions: [], career_stage: [] },
    requirements: null,
    link: "",
    confidence: 0,
  };
};
