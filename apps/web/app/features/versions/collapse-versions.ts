// Spec 76 — collapse a session's `working` rows behind their owning `checkpoint`
// so the Versions list shows one entry per meaningful checkpoint instead of a row
// per Cesare turn (BUG-N66, the flood). Pure and editor-agnostic: it only reshapes
// the already-loaded VersionView[]; the drawer renders the result.
//
// A session is identified by `cesareSessionId`. Within one session the
// `checkpoint` row is the visible anchor and the `working` rows nest under it
// (collapsed by default, expandable). `manual` rows — user versions, explicit
// mints, and every screenplay row — always stand on their own.

import type { VersionView } from "./version-view";

export interface CollapsedEntry {
  /** The row shown in the list: a checkpoint, or a standalone manual version. */
  readonly anchor: VersionView;
  /** The session's working rows, newest-first, nested under the checkpoint.
   *  Empty for a standalone manual row. */
  readonly working: ReadonlyArray<VersionView>;
}

/**
 * Reshape a newest-first version list into collapsed entries. Working rows are
 * folded under their session's checkpoint; a working row whose checkpoint is not
 * in the list (e.g. pruned) degrades to a standalone entry so nothing is hidden
 * by accident. Order of anchors follows the input order (newest-first).
 */
export const collapseVersions = (
  versions: ReadonlyArray<VersionView>,
): ReadonlyArray<CollapsedEntry> => {
  // Group working rows by session so each checkpoint can collect its own.
  const workingBySession = new Map<string, VersionView[]>();
  for (const v of versions) {
    if (v.kind === "working" && v.cesareSessionId) {
      const list = workingBySession.get(v.cesareSessionId) ?? [];
      list.push(v);
      workingBySession.set(v.cesareSessionId, list);
    }
  }

  const entries: CollapsedEntry[] = [];
  const claimedSessions = new Set<string>();
  for (const v of versions) {
    if (v.kind === "checkpoint" && v.cesareSessionId) {
      entries.push({
        anchor: v,
        working: workingBySession.get(v.cesareSessionId) ?? [],
      });
      claimedSessions.add(v.cesareSessionId);
      continue;
    }
    if (v.kind === "working" && v.cesareSessionId) {
      // Folded under its checkpoint above — skip here. If the checkpoint never
      // appears, surface the working rows standalone (see the post-pass below).
      continue;
    }
    // manual (or screenplay) → standalone.
    entries.push({ anchor: v, working: [] });
  }

  // Orphaned working rows (no checkpoint in the list): show them standalone so a
  // pruned/missing checkpoint never hides a version the writer can return to.
  for (const [session, working] of workingBySession) {
    if (claimedSessions.has(session)) continue;
    for (const v of working) entries.push({ anchor: v, working: [] });
  }

  return entries;
};
