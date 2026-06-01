export type RoomKind = "screenplay" | "branch" | "document";

export interface ParsedRoom {
  kind: RoomKind;
  id: string;
}

const KIND_BY_PREFIX: Record<string, RoomKind> = {
  screenplay: "screenplay",
  branch: "branch",
  document: "document",
};

/**
 * Room ids are `<kind>:<uuid>` (e.g. `screenplay:abc-123`). Anything that does
 * not match a known kind + a non-empty id resolves to null so the upgrade
 * handler can reject it with a 4004.
 */
export const parseRoomId = (roomId: string): ParsedRoom | null => {
  const sep = roomId.indexOf(":");
  if (sep <= 0) return null;
  const prefix = roomId.slice(0, sep);
  const id = roomId.slice(sep + 1);
  const kind = KIND_BY_PREFIX[prefix];
  if (!kind || id.length === 0) return null;
  return { kind, id };
};
