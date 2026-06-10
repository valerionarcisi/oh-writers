// BUG-066 — one bell notification per Cesare turn.
//
// The bell row lifecycle is: a single notification is CREATED when the turn
// starts ("Cesare sta lavorando…") and the SAME id is settled when the turn
// ends — completed in place ("Cesare ha aggiornato il <doc>"), failed, or
// dismissed. This module owns the pure settle decision: given the turn outcome
// and the final reply (with its honest apply markers), what happens to the
// pending row? AppShell translates the decision into context dispatches; this
// stays free of React so the policy is unit-testable in isolation.
import {
  parseToolsExecuted,
  parseDocAppliedMarker,
  parseEntityAppliedMarkers,
  parseRewriteSceneMarker,
} from "~/features/predictions";
import type { CesarePage } from "~/features/predictions";
import type { TranslationKey } from "@oh-writers/domain";

export type CesareTurnOutcome = "delivered" | "failed" | "aborted";

/** The entity a completed turn actually wrote, resolved to the page the
 *  "Vai al <documento>" link must navigate to. */
export interface AppliedTarget {
  readonly domain: string;
  readonly page: CesarePage;
  readonly updatedLabelKey: TranslationKey;
  readonly goToLabelKey: TranslationKey;
}

export type TurnSettleDecision =
  /** Conversational turn (no tool ran) or user abort — the "sta lavorando"
   *  row disappears; the chat bubble is the only record. */
  | { readonly kind: "dismiss" }
  /** The run errored — the row flips to the failed state in place. */
  | { readonly kind: "fail" }
  /** Tools ran and a real apply marker is present — the row completes in
   *  place with the "ha aggiornato" headline and the go-to link. */
  | { readonly kind: "complete-applied"; readonly target: AppliedTarget }
  /** Tools ran but nothing was applied (read-only tools, no-op edit) — the
   *  row completes with the per-page "ha risposto" label, no link. */
  | { readonly kind: "complete-replied" };

interface TargetLabels {
  readonly page: CesarePage;
  readonly updatedLabelKey: TranslationKey;
  readonly goToLabelKey: TranslationKey;
}

// The logline has no page of its own — it is edited from the Soggetto page,
// so its link lands there. Every other domain maps to its own page.
const TARGET_BY_DOMAIN: Record<string, TargetLabels> = {
  logline: {
    page: "soggetto",
    updatedLabelKey: "shell.notif.updated.logline",
    goToLabelKey: "shell.notif.goTo.logline",
  },
  soggetto: {
    page: "soggetto",
    updatedLabelKey: "shell.notif.updated.soggetto",
    goToLabelKey: "shell.notif.goTo.soggetto",
  },
  synopsis: {
    page: "synopsis",
    updatedLabelKey: "shell.notif.updated.synopsis",
    goToLabelKey: "shell.notif.goTo.synopsis",
  },
  outline: {
    page: "outline",
    updatedLabelKey: "shell.notif.updated.outline",
    goToLabelKey: "shell.notif.goTo.outline",
  },
  treatment: {
    page: "treatment",
    updatedLabelKey: "shell.notif.updated.treatment",
    goToLabelKey: "shell.notif.goTo.treatment",
  },
  screenplay: {
    page: "screenplay",
    updatedLabelKey: "shell.notif.updated.screenplay",
    goToLabelKey: "shell.notif.goTo.screenplay",
  },
  breakdown: {
    page: "breakdown",
    updatedLabelKey: "shell.notif.updated.breakdown",
    goToLabelKey: "shell.notif.goTo.breakdown",
  },
  budget: {
    page: "budget",
    updatedLabelKey: "shell.notif.updated.budget",
    goToLabelKey: "shell.notif.goTo.budget",
  },
  schedule: {
    page: "schedule",
    updatedLabelKey: "shell.notif.updated.schedule",
    goToLabelKey: "shell.notif.goTo.schedule",
  },
  "shooting-plan": {
    page: "shooting-plan",
    updatedLabelKey: "shell.notif.updated.shootingPlan",
    goToLabelKey: "shell.notif.goTo.shootingPlan",
  },
  locations: {
    page: "locations",
    updatedLabelKey: "shell.notif.updated.locations",
    goToLabelKey: "shell.notif.goTo.locations",
  },
};

/**
 * Resolve the PRIMARY applied entity of a turn from the honest apply markers
 * (never from the chat text — the tracer invariant). Document edits win over
 * entity edits; a scene rewrite resolves to the screenplay. Returns `null`
 * when the turn applied nothing or the domain is unknown (fail closed: no
 * link rather than a broken one).
 */
export const appliedTargetFromReply = (reply: string): AppliedTarget | null => {
  const docApplied = parseDocAppliedMarker(reply);
  const domain =
    (docApplied && docApplied.documentType) ||
    parseEntityAppliedMarkers(reply)[0]?.domain ||
    (parseRewriteSceneMarker(reply) ? "screenplay" : null);
  if (!domain) return null;
  const labels = TARGET_BY_DOMAIN[domain];
  if (!labels) return null;
  return { domain, ...labels };
};

export const decideTurnSettle = (
  outcome: CesareTurnOutcome,
  reply: string | null,
): TurnSettleDecision => {
  if (outcome === "aborted") return { kind: "dismiss" };
  if (outcome === "failed" || reply === null) return { kind: "fail" };
  if (parseToolsExecuted(reply) === 0) return { kind: "dismiss" };
  const target = appliedTargetFromReply(reply);
  return target
    ? { kind: "complete-applied", target }
    : { kind: "complete-replied" };
};
