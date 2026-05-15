export const CREW_DEPARTMENTS = [
  "regia",
  "fotografia",
  "suono",
  "arte",
  "costumi",
  "trucco",
  "produzione",
] as const;
export type CrewDepartment = (typeof CREW_DEPARTMENTS)[number];

export const CREW_ROLES = [
  // regia
  {
    key: "first_ad",
    labelIt: "1° Assistente Regia",
    department: "regia",
    defaultDayRate: 450,
  },
  {
    key: "second_ad",
    labelIt: "2° Assistente Regia",
    department: "regia",
    defaultDayRate: 300,
  },
  // fotografia
  {
    key: "dop",
    labelIt: "Direttore della Fotografia",
    department: "fotografia",
    defaultDayRate: 800,
  },
  {
    key: "camera_operator",
    labelIt: "Operatore",
    department: "fotografia",
    defaultDayRate: 450,
  },
  {
    key: "focus_puller",
    labelIt: "1° Assistente Operatore",
    department: "fotografia",
    defaultDayRate: 300,
  },
  {
    key: "gaffer",
    labelIt: "Capo Elettricista",
    department: "fotografia",
    defaultDayRate: 400,
  },
  {
    key: "best_boy",
    labelIt: "Elettricista",
    department: "fotografia",
    defaultDayRate: 250,
  },
  // suono
  {
    key: "sound_mixer",
    labelIt: "Fonico di Presa Diretta",
    department: "suono",
    defaultDayRate: 400,
  },
  {
    key: "boom_operator",
    labelIt: "Microfonista",
    department: "suono",
    defaultDayRate: 250,
  },
  // arte
  {
    key: "production_designer",
    labelIt: "Scenografo",
    department: "arte",
    defaultDayRate: 600,
  },
  {
    key: "art_director",
    labelIt: "Arredatore",
    department: "arte",
    defaultDayRate: 400,
  },
  {
    key: "prop_master",
    labelIt: "Capo Attrezzista",
    department: "arte",
    defaultDayRate: 350,
  },
  // costumi
  {
    key: "costume_designer",
    labelIt: "Costumista",
    department: "costumi",
    defaultDayRate: 450,
  },
  {
    key: "wardrobe_assistant",
    labelIt: "Assistente Costumi",
    department: "costumi",
    defaultDayRate: 250,
  },
  // trucco
  {
    key: "makeup_artist",
    labelIt: "Truccatore/Truccatrice",
    department: "trucco",
    defaultDayRate: 350,
  },
  {
    key: "hair_stylist",
    labelIt: "Parrucchiere/Parrucchiera",
    department: "trucco",
    defaultDayRate: 300,
  },
  // produzione
  {
    key: "production_manager",
    labelIt: "Direttore di Produzione",
    department: "produzione",
    defaultDayRate: 600,
  },
  {
    key: "production_coordinator",
    labelIt: "Segretario/a di Produzione",
    department: "produzione",
    defaultDayRate: 300,
  },
  {
    key: "runner",
    labelIt: "Runner",
    department: "produzione",
    defaultDayRate: 150,
  },
] as const;

export type CrewRoleKey = (typeof CREW_ROLES)[number]["key"];

export const CREW_ROLE_BY_KEY = Object.fromEntries(
  CREW_ROLES.map((r) => [r.key, r]),
) as Record<CrewRoleKey, (typeof CREW_ROLES)[number]>;

export const FISCAL_REGIMES = ["piva", "privato", "none"] as const;
export type FiscalRegime = (typeof FISCAL_REGIMES)[number];

export const RATE_UNITS = ["giornata", "posa", "forfait"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const fiscalMultiplier = (regime: FiscalRegime): number => {
  if (regime === "privato") return 1.2;
  return 1.0;
};

export const resourceTotal = (r: {
  days: number;
  dayRate: number;
  fiscalRegime: FiscalRegime;
  mealAllowance: number;
  accommodation: number;
  rateUnit?: RateUnit;
}): number => {
  if (r.rateUnit === "forfait") {
    return r.dayRate * fiscalMultiplier(r.fiscalRegime);
  }
  return (
    r.days * r.dayRate * fiscalMultiplier(r.fiscalRegime) +
    r.mealAllowance +
    r.accommodation
  );
};
