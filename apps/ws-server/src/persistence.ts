import { encodeStateAsUpdate } from "./yjs-shared.js";
import type { Doc as YDoc } from "./yjs-shared.js";
import { eq } from "drizzle-orm";
import { db } from "@oh-writers/db";
import {
  documents,
  screenplays,
  screenplayBranches,
} from "@oh-writers/db/schema";
import type { ParsedRoom } from "./room-id.js";

/**
 * Load the persisted Yjs binary for a room, or null when the document has
 * never been synced (a fresh doc — the first client seeds it from its PM doc).
 */
export const loadYjsState = async (
  room: ParsedRoom,
): Promise<Uint8Array | null> => {
  switch (room.kind) {
    case "screenplay": {
      const row = await db.query.screenplays.findFirst({
        where: eq(screenplays.id, room.id),
        columns: { yjsState: true },
      });
      return row?.yjsState ?? null;
    }
    case "document": {
      const row = await db.query.documents.findFirst({
        where: eq(documents.id, room.id),
        columns: { yjsState: true },
      });
      return row?.yjsState ?? null;
    }
    case "branch": {
      const row = await db.query.screenplayBranches.findFirst({
        where: eq(screenplayBranches.id, room.id),
        columns: { yjsState: true },
      });
      return row?.yjsState ?? null;
    }
  }
};

/**
 * Persist the room's current Yjs state. This is the ONLY thing the ws-server
 * writes — the human-readable content/pmDoc + versions stay owned by the web
 * client's HTTP autosave (the content bridge), so versioning and downstream
 * consumers are untouched.
 */
export const flushRoom = async (
  room: ParsedRoom,
  ydoc: YDoc,
): Promise<void> => {
  const state = Buffer.from(encodeStateAsUpdate(ydoc));
  const updatedAt = new Date();

  switch (room.kind) {
    case "screenplay":
      await db
        .update(screenplays)
        .set({ yjsState: state, updatedAt })
        .where(eq(screenplays.id, room.id));
      return;
    case "document":
      await db
        .update(documents)
        .set({ yjsState: state, updatedAt })
        .where(eq(documents.id, room.id));
      return;
    case "branch":
      await db
        .update(screenplayBranches)
        .set({ yjsState: state, updatedAt })
        .where(eq(screenplayBranches.id, room.id));
      return;
  }
};
