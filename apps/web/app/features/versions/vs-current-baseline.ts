// apps/web/app/features/versions/vs-current-baseline.ts
//
// Pure resolution of the "vs current" diff baseline for the Versions
// SplitDrawer (Spec 49). The baseline arrives from the optional `?vcur=`
// companion and is `null` on a bare `?versions=` deep-link. In that case the
// drawer must fall back to the document's CURRENT active version so the
// vs-current diff renders immediately instead of stalling on "Seleziona una
// versione" (audit F-A1).
//
// The version list is ordered newest-first (the server sorts by descending
// version number), so the head of the list IS the document's current active
// version — the same id `?vcur=` carries when the drawer is opened normally.

/** The minimum a version needs for baseline resolution: its id. */
export interface VersionRef {
  readonly id: string;
}

/**
 * Resolve the "vs current" baseline version id. Pure, no I/O.
 *
 * A `?vcur=` value that resolves to one of THIS document's versions always wins
 * (deep-link override). Otherwise — absent, malformed, or pointing at a foreign
 * version — fall back to the most recent version (`versions[0]`, the list head),
 * so a bare `?versions=` deep-link shows the vs-current diff. Returns `null`
 * only when there are no versions at all.
 */
export const resolveCurrentVersionId = (
  versions: readonly VersionRef[],
  vcur: string | null,
): string | null => {
  if (vcur != null && versions.some((v) => v.id === vcur)) return vcur;
  return versions[0]?.id ?? null;
};
