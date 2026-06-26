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
import type { TranslationKey } from "@oh-writers/domain";

export type RailSectionId = "sviluppo" | "produzione" | "recenti";

/** A translator — `useTranslation().t`. Passed in so this module stays
 *  framework-agnostic (no React hook import). */
type Translate = (key: TranslationKey) => string;

type NavEntry = {
  id: string;
  segment: string;
  labelKey: TranslationKey;
  /** Glyph the rail will render — a unicode character used as-is. The icon
   *  sprite doesn't yet cover every section so we keep the legacy glyphs
   *  for parity with the mockup. */
  glyph: string;
};

const DEV_ENTRIES: ReadonlyArray<NavEntry> = [
  { id: "soggetto", segment: "soggetto", labelKey: "nav.soggetto", glyph: "¶" },
  { id: "synopsis", segment: "synopsis", labelKey: "nav.synopsis", glyph: "¶" },
  { id: "outline", segment: "outline", labelKey: "nav.outline", glyph: "≡" },
  {
    id: "treatment",
    segment: "treatment",
    labelKey: "nav.treatment",
    glyph: "▤",
  },
  {
    id: "screenplay",
    segment: "screenplay",
    labelKey: "nav.screenplay",
    glyph: "▣",
  },
];

const PROD_ENTRIES: ReadonlyArray<NavEntry> = [
  {
    id: "breakdown",
    segment: "breakdown",
    labelKey: "nav.breakdown",
    glyph: "◧",
  },
  { id: "budget", segment: "budget", labelKey: "nav.budget", glyph: "€" },
  { id: "schedule", segment: "schedule", labelKey: "nav.schedule", glyph: "▦" },
  {
    id: "locations",
    segment: "locations",
    labelKey: "nav.locations",
    glyph: "◎",
  },
  {
    id: "shooting-plan",
    segment: "shooting-plan",
    labelKey: "nav.shootingPlan",
    glyph: "▦",
  },
];

/** Build the rail navigation for a project. The active flag is computed
 *  against `currentSegment` (e.g. "breakdown"); pass an empty string to
 *  render the rail without any active highlight. `t` resolves labels to the
 *  active locale. */
export function buildRailNav({
  projectId,
  currentSegment,
  t,
}: {
  projectId: string;
  currentSegment: string;
  t: Translate;
}): { sviluppo: RailSection; produzione: RailSection } {
  const toRailItem = (entry: NavEntry): RailNavItem => ({
    id: entry.id,
    label: t(entry.labelKey),
    icon: entry.glyph,
    href: `/projects/${projectId}/${entry.segment}`,
    isActive: entry.segment === currentSegment,
  });
  return {
    sviluppo: {
      label: t("navGroup.development"),
      items: DEV_ENTRIES.map(toRailItem),
    },
    produzione: {
      label: t("navGroup.production"),
      items: PROD_ENTRIES.map(toRailItem),
    },
  };
}

/** Active section label, used by the slim TopBar crumb. */
export function railSectionLabelForSegment(
  segment: string,
  t: Translate,
): string | null {
  const entry = [...DEV_ENTRIES, ...PROD_ENTRIES].find(
    (e) => e.segment === segment,
  );
  return entry ? t(entry.labelKey) : null;
}

/** All known segments — useful for route-id matching helpers in `_app.tsx`. */
export const ALL_RAIL_SEGMENTS: ReadonlyArray<string> = [
  ...DEV_ENTRIES.map((e) => e.segment),
  ...PROD_ENTRIES.map((e) => e.segment),
];

/**
 * Guard every `/projects/$id/...` navigation against a missing project id.
 *
 * Building a project route from a possibly-undefined id yields the literal
 * `/projects/undefined/...`, which matches no route and sends the router into a
 * re-match storm ("Maximum update depth" + repeated `/projects/undefined/*`
 * matches — the Bug 2 / 3a loop family). This pure predicate is the single check
 * the shell's session-navigation handlers use BEFORE calling `router.navigate`,
 * so a project route is never built from an absent id.
 *
 * Returns the trimmed id when it is a usable project id, else `null` (callers
 * `if (!resolveProjectIdForNav(id)) return;`).
 */
export function resolveProjectIdForNav(
  projectId: string | null | undefined,
): string | null {
  if (projectId == null) return null;
  const trimmed = projectId.trim();
  if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
    return null;
  }
  return trimmed;
}
