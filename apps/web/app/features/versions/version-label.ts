// The single place that turns a version row into the name a writer reads.
//
// #55 — Cesare mints its rows with an internal label ("draft Cesare · sinossi").
// That string is load-bearing for the working/checkpoint model, but it was also
// rendered verbatim: after an edit the TopBar chip and the Versions lane both
// announced "DRAFT CESARE · SINOSSI", so a document the writer had just accepted
// onto its current version still read as a lingering draft. The internal label is
// kept in the database and translated HERE instead, in the one resolver both
// surfaces share.

import type { TranslationKey } from "@oh-writers/domain";

type Translate = (key: TranslationKey) => string;

/** The shape this resolver needs — narrower than the full `VersionView` so the
 *  TopBar chip, which holds a raw database row (where `kind` is the column's
 *  plain string), can use it too. */
export interface LabelledVersion {
  readonly number: number;
  readonly label: string | null;
  readonly kind?: string | null;
}

/**
 * A version's user-facing name. A row the user named keeps their text verbatim.
 * Rows Cesare owns (`working`/`checkpoint`) carry an internal label instead of a
 * chosen one, so they read like any unnamed version — by their number — rather
 * than leaking "draft Cesare · sinossi" into the chrome.
 *
 * The version NUMBER is deliberately not appended here — it is rendered
 * separately, so a rename never looks like it grew a "(vN)" suffix (#58).
 */
export const versionDisplayLabel = (
  version: LabelledVersion,
  t: Translate,
): string => {
  const isCesareRow =
    version.kind === "working" || version.kind === "checkpoint";
  const label = version.label?.trim() ?? "";
  return label.length > 0 && !isCesareRow
    ? label
    : `${t("versions.split.versionPrefix")} ${version.number}`;
};
