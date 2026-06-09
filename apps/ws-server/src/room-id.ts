export type RoomKind = "screenplay" | "branch" | "document";

export interface ParsedRoom {
  kind: RoomKind;
  /** The entity id. For every kind this is the screenplay/document/branch id —
   *  NOT the version id (so room access + entity lookups stay unchanged). */
  id: string;
  /** Screenplay only: the active version this room is scoped to. The screenplay
   *  content is version-backed, so each version is its own CRDT persisted in
   *  `screenplay_versions.yjs_snapshot`. Absent → legacy screenplay-level room
   *  (persisted in `screenplays.yjs_state`). */
  versionId?: string;
}

const KIND_BY_PREFIX: Record<string, RoomKind> = {
  screenplay: "screenplay",
  branch: "branch",
  document: "document",
};

/**
 * Room ids are `<kind>:<uuid>` (e.g. `screenplay:abc-123`). The screenplay kind
 * also accepts a version-scoped form `screenplay:<screenplayId>:<versionId>`
 * (3 segments) so each active version has its own CRDT. `id` stays the
 * screenplay id; `versionId` carries the scope. Anything that does not match a
 * known kind + a non-empty id resolves to null so the upgrade handler can
 * reject it with a 4004.
 */
export const parseRoomId = (roomId: string): ParsedRoom | null => {
  const sep = roomId.indexOf(":");
  if (sep <= 0) return null;
  const prefix = roomId.slice(0, sep);
  const rest = roomId.slice(sep + 1);
  const kind = KIND_BY_PREFIX[prefix];
  if (!kind || rest.length === 0) return null;

  // Screenplay rooms may carry a version scope: `<screenplayId>:<versionId>`.
  if (kind === "screenplay") {
    const vsep = rest.indexOf(":");
    if (vsep > 0) {
      const id = rest.slice(0, vsep);
      const versionId = rest.slice(vsep + 1);
      if (id.length === 0 || versionId.length === 0) return null;
      return { kind, id, versionId };
    }
  }

  return { kind, id: rest };
};
