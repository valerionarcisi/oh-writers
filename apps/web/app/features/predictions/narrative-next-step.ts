// apps/web/app/features/predictions/narrative-next-step.ts
//
// Spec 50 (Part 2) — the next narrative step is a PURE function over which
// documents already have content for the project. The documents ARE the state:
// "progress" is simply which entities in the chain are written. This module has
// no side effects and no I/O so it is trivially testable.
//
// The chain is logline → soggetto → sinossi → scaletta → trattamento →
// sceneggiatura. The first GAP in that chain (the earliest step whose upstream
// is satisfied but which is itself empty) is the single next step Cesare offers.
//
// The chip seeds the returned natural-language prompt through the EXISTING send
// path; Cesare's universal dispatch (A7) then picks the right generator and
// reads the upstream docs. We do NOT call a generator here — this is a thin
// orchestration that derives one suggestion, never an automatic chain.

import { match } from "ts-pattern";
import type { StreamEntityDomain } from "./cesare-stream-events";

/** The narrative entities, in chain order, that the suggestion walks through. */
export const NARRATIVE_CHAIN = [
  "logline",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
  "screenplay",
] as const;

export type NarrativeStep = (typeof NARRATIVE_CHAIN)[number];

/**
 * Which narrative entities currently hold content. Sourced from the documents +
 * screenplay rows of a project (empty content ⇒ false). This is the only input
 * the next-step decision needs.
 */
export type NarrativePresence = Readonly<Record<NarrativeStep, boolean>>;

/**
 * A single next-step suggestion: the entity to write next, the chip label shown
 * in the chat, and the natural-language Italian prompt seeded into the composer
 * when the user clicks. `prompt` flows through the normal send path so the
 * universal dispatch reads the upstream docs and runs exactly one generation.
 */
export interface NextStepSuggestion {
  readonly step: NarrativeStep;
  readonly chipLabel: string;
  readonly prompt: string;
}

const SUGGESTION_BY_STEP: Readonly<Record<NarrativeStep, NextStepSuggestion>> =
  {
    logline: {
      step: "logline",
      chipLabel: "Scrivi una logline dal tuo spunto",
      // Phrased to trigger `write_logline` from a free premise. If no spunto was
      // given yet, the user's spunto is simply their first message.
      prompt:
        "Scrivi una logline su quello che ti ho raccontato come spunto. Se non ti ho ancora dato uno spunto, chiedimelo in una riga.",
    },
    soggetto: {
      step: "soggetto",
      chipLabel: "Genera il soggetto dalla logline",
      // `propose_soggetto_v2` rewrites the soggetto reading the upstream logline.
      prompt:
        "Riscrivi il soggetto a partire dalla logline esistente del progetto.",
    },
    synopsis: {
      step: "synopsis",
      chipLabel: "Genera la sinossi dal soggetto",
      prompt:
        "Genera la sinossi a partire dal soggetto e dalla logline esistenti del progetto.",
    },
    outline: {
      step: "outline",
      chipLabel: "Genera la scaletta dal soggetto",
      prompt:
        "Genera la scaletta dal soggetto: una lista numerata di scene a partire dal soggetto esistente del progetto.",
    },
    treatment: {
      step: "treatment",
      chipLabel: "Scrivi il trattamento dalla scaletta",
      prompt:
        "Scrivi il trattamento a partire dalla scaletta e dal soggetto esistenti del progetto.",
    },
    screenplay: {
      step: "screenplay",
      chipLabel: "Imposta la sceneggiatura dal trattamento",
      prompt:
        "Aiutami a impostare la sceneggiatura a partire dal trattamento esistente del progetto.",
    },
  };

/**
 * The next narrative step is the FIRST entity in the chain that is still empty.
 * Every entity upstream of it is, by construction, already written (the chain is
 * walked in order). When the whole chain is written there is no suggestion.
 *
 * Note: a downstream entity can exist while an upstream one is missing (the user
 * is free to write out of order). We still surface the earliest gap so the
 * suggestion always nudges toward completing the chain from the top.
 */
export const nextNarrativeStep = (
  presence: NarrativePresence,
): NextStepSuggestion | null => {
  const firstGap = NARRATIVE_CHAIN.find((step) => !presence[step]);
  return firstGap ? SUGGESTION_BY_STEP[firstGap] : null;
};

/** Narrows a stream-entity domain to a narrative chain step, or null. */
export const narrativeStepFromDomain = (
  domain: StreamEntityDomain,
): NarrativeStep | null =>
  match(domain)
    .with(
      "logline",
      "soggetto",
      "synopsis",
      "outline",
      "treatment",
      "screenplay",
      (d) => d satisfies NarrativeStep,
    )
    .otherwise(() => null);
