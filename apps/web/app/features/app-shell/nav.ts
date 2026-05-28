// apps/web/app/features/app-shell/nav.ts
//
// Single source of truth for the LeftRail navigation. The legacy TopBar
// used to receive `sections` or `sectionGroups` arrays from `_app.tsx`
// — the slim shell flips that pattern: nav structure lives here, the rail
// is told what to render. Every per-page route just exposes its `segment`
// and the helper does the rest.
//
// Keep this module framework-agnostic: pure data and the small adapter that
// turns it into the rail-friendly shape. No router imports here.

import type { RailSection, RailNavItem } from "@oh-writers/ui";

export type RailSectionId = "sviluppo" | "produzione" | "recenti";

type NavEntry = {
  id: string;
  segment: string;
  label: string;
  /** Glyph the rail will render — a unicode character used as-is. The icon
   *  sprite doesn't yet cover every section so we keep the legacy glyphs
   *  for parity with the mockup. */
  glyph: string;
};

const DEV_ENTRIES: ReadonlyArray<NavEntry> = [
  { id: "soggetto", segment: "soggetto", label: "Soggetto", glyph: "¶" },
  { id: "synopsis", segment: "synopsis", label: "Sinossi", glyph: "¶" },
  { id: "outline", segment: "outline", label: "Scaletta", glyph: "≡" },
  { id: "treatment", segment: "treatment", label: "Trattamento", glyph: "▤" },
  {
    id: "screenplay",
    segment: "screenplay",
    label: "Sceneggiatura",
    glyph: "▣",
  },
];

const PROD_ENTRIES: ReadonlyArray<NavEntry> = [
  { id: "breakdown", segment: "breakdown", label: "Breakdown", glyph: "◧" },
  { id: "budget", segment: "budget", label: "Budget", glyph: "€" },
  { id: "schedule", segment: "schedule", label: "Calendario", glyph: "▦" },
  { id: "locations", segment: "locations", label: "Location", glyph: "◎" },
  {
    id: "shooting-plan",
    segment: "shooting-plan",
    label: "Inquadrature",
    glyph: "▦",
  },
];

/** Build the rail navigation for a project. The active flag is computed
 *  against `currentSegment` (e.g. "breakdown"); pass an empty string to
 *  render the rail without any active highlight. */
export function buildRailNav({
  projectId,
  currentSegment,
}: {
  projectId: string;
  currentSegment: string;
}): { sviluppo: RailSection; produzione: RailSection } {
  const toRailItem = (entry: NavEntry): RailNavItem => ({
    id: entry.id,
    label: entry.label,
    icon: entry.glyph,
    href: `/projects/${projectId}/${entry.segment}`,
    isActive: entry.segment === currentSegment,
  });
  return {
    sviluppo: {
      label: "Sviluppo",
      items: DEV_ENTRIES.map(toRailItem),
    },
    produzione: {
      label: "Produzione",
      items: PROD_ENTRIES.map(toRailItem),
    },
  };
}

/** Active section label, used by the slim TopBar crumb. */
export function railSectionLabelForSegment(segment: string): string | null {
  const entry = [...DEV_ENTRIES, ...PROD_ENTRIES].find(
    (e) => e.segment === segment,
  );
  return entry?.label ?? null;
}

/** All known segments — useful for route-id matching helpers in `_app.tsx`. */
export const ALL_RAIL_SEGMENTS: ReadonlyArray<string> = [
  ...DEV_ENTRIES.map((e) => e.segment),
  ...PROD_ENTRIES.map((e) => e.segment),
];
