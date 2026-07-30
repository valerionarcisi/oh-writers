// The query-key registry.
//
// Three bugs closed in PR #110 had one shared cause: something wrote data and
// nothing told the rest of the app to read it again. Invalidation was spread
// across ~124 call sites in ~38 files, each spelling its keys as string
// literals, so a writer had to REMEMBER what a reader had named its query.
// Memory does not scale, and the failure is invisible in development because
// we reload constantly.
//
// This module makes the key the shared fact:
//
//   - a reader builds its key here, so the name exists in exactly one place
//   - a writer invalidates through `invalidateFor`, naming the ENTITY it wrote
//     rather than guessing which query keys happen to hold it
//   - renaming a key is a type error instead of a silent stale panel
//
// Keys are hierarchical, matching TanStack Query's prefix matching: invalidating
// `versions.all(docId)` also drops `versions.detail(...)` beneath it.
//
// Migration is incremental by design. Existing literal keys keep working — this
// registry reproduces them exactly (see query-keys.test.ts, which pins the
// shapes). Move a feature over when you touch it; do not rewrite 38 files at
// once.

import type { QueryClient } from "@tanstack/react-query";

/** Narrative documents (soggetto, sinossi, scaletta, trattamento). */
const documents = {
  all: () => ["documents"] as const,
  detail: (projectId: string, type: string) =>
    ["documents", projectId, type] as const,
  currentVersion: (documentId: string) =>
    ["documents", "current-version", documentId] as const,
} as const;

/** Document version lists + the screenplay's own version family. */
const versions = {
  /** Narrative document versions. */
  document: (documentId: string) => ["document-versions", documentId] as const,
  /** Screenplay versions. */
  screenplay: (screenplayId: string) => ["versions", screenplayId] as const,
  screenplayCurrent: (screenplayId: string) =>
    ["screenplay-current-version", screenplayId] as const,
  detail: (versionId: string) => ["versions", "detail", versionId] as const,
} as const;

const projects = {
  all: () => ["projects"] as const,
  detail: (projectId: string) => ["projects", projectId] as const,
} as const;

const breakdown = {
  all: () => ["breakdown"] as const,
  forScene: (sceneId: string, versionId: string) =>
    ["breakdown", "scene", sceneId, versionId] as const,
  forProject: (projectId: string, versionId: string) =>
    ["breakdown", "project", projectId, versionId] as const,
  sceneCost: (
    projectId: string,
    sceneNumber: number | null,
    versionId: string,
  ) => ["breakdown", "scene-cost", projectId, sceneNumber, versionId] as const,
} as const;

const budget = {
  all: (projectId: string) => ["budget", projectId] as const,
  castCrew: (projectId: string) => ["budget-cast-crew", projectId] as const,
  dayCosts: (projectId: string) => ["budget-day-costs", projectId] as const,
} as const;

const cesare = {
  messages: (projectId: string, sessionId: string) =>
    ["cesare-messages", projectId, sessionId] as const,
} as const;

export const queryKeys = {
  documents,
  versions,
  projects,
  breakdown,
  budget,
  cesare,
} as const;

// ─── Entity-driven invalidation ───────────────────────────────────────────────

/** What a write touched. A writer names the entity; this module owns the
 *  mapping to query keys, so a caller never has to know what a reader named
 *  its query.
 *
 *  These names match the Cesare tracer's `StreamEntityDomain`, so a tool's
 *  existing domain declaration doubles as its invalidation instruction — no
 *  second list to keep in step. */
export type WrittenEntity =
  | "document"
  | "screenplay"
  | "breakdown"
  | "budget"
  | "project"
  | "schedule"
  | "shooting-plan"
  | "locations"
  // Tracer domains for the narrative documents. They all live in the same
  // `documents` + version families, so they map to the same keys.
  | "logline"
  | "soggetto"
  | "synopsis"
  | "outline"
  | "treatment";

/** Every narrative doc type reads from the same families, so they share one
 *  list rather than repeating it five times. */
const DOCUMENT_FAMILIES: ReadonlyArray<readonly unknown[]> = [
  documents.all(),
  ["document-versions"],
  ["documents", "current-version"],
  // Cesare's applied-but-unpromoted edits; the drafts banner reads this.
  ["document-drafts"],
];

/** Every key family that must be re-read when `entity` changes.
 *
 *  Deliberately BROAD: these are prefixes, and over-invalidating costs a
 *  refetch while under-invalidating costs a user staring at stale data and
 *  losing trust in what the screen says. When in doubt, include the family.
 *
 *  Every entry here is a family that EXISTS in the feature code — verified by
 *  `query-keys.test.ts`, which greps the real `queryKey:` declarations. An
 *  invented prefix invalidates nothing and looks exactly like a working one,
 *  which is how three of them survived the first round of this file.
 *
 *  Exported for that test only; writers go through `invalidateFor`. */
export const FAMILIES_FOR_ENTITY: Record<
  WrittenEntity,
  ReadonlyArray<readonly unknown[]>
> = {
  document: DOCUMENT_FAMILIES,
  // A screenplay edit moves the script, its versions and the active pointer,
  // plus the surfaces derived from it (proposals, polish, sync state).
  screenplay: [
    ["screenplay"],
    ["screenplays"],
    ["versions"],
    ["screenplay-current-version"],
    ["screenplay-proposals"],
    ["screenplay-polish"],
    ["screenplay-sync-state"],
  ],
  breakdown: [breakdown.all(), ["spoglio-progress"]],
  // The budget fans out into derived views — a topsheet, caps, a weekly split,
  // per-scene rows. Covering only the base family left those stale, which is
  // the very bug this module exists to prevent.
  budget: [
    ["budget"],
    ["budget-cast-crew"],
    ["budget-day-costs"],
    ["budget-overview"],
    ["budget-caps"],
    ["budget-weekly"],
    ["budget-scenes"],
  ],
  project: [projects.all()],
  schedule: [["schedule"]],
  "shooting-plan": [["shooting-plan"], ["shot-plan"], ["blocking"]],
  locations: [["locations"]],
  logline: DOCUMENT_FAMILIES,
  soggetto: DOCUMENT_FAMILIES,
  synopsis: DOCUMENT_FAMILIES,
  outline: DOCUMENT_FAMILIES,
  treatment: DOCUMENT_FAMILIES,
} as const;

/**
 * Invalidate everything that reads `entities`.
 *
 * Use this from any writer that does not know which document or screenplay it
 * touched — a Cesare tool loop, a bulk action, a background job. A writer that
 * DOES know its id should invalidate the precise key instead; this is the
 * fallback that keeps a broad write from silently going unnoticed.
 */
export const invalidateFor = (
  queryClient: QueryClient,
  entities: ReadonlyArray<WrittenEntity>,
): void => {
  const seen = new Set<string>();
  for (const entity of entities) {
    for (const key of FAMILIES_FOR_ENTITY[entity]) {
      const fingerprint = JSON.stringify(key);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }
};
