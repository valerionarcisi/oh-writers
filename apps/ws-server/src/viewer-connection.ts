import type { Doc as YDoc } from "./yjs-shared.js";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import type { WebSocket } from "ws";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// y-protocols sync sub-message types.
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

interface SharedDoc extends YDoc {
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

/**
 * Attach a READ-ONLY connection for a viewer-role user. The viewer receives the
 * full document (sync step 1) and all live updates + awareness (remote cursors),
 * but any attempt to write (sync step 2 / update) is dropped and answered with a
 * WRITE_FORBIDDEN error. This enforces the spec's viewer write-protection without
 * mutating y-websocket's editor path.
 */
export const attachViewerConnection = (conn: WebSocket, doc: SharedDoc): void => {
  conn.binaryType = "arraybuffer";
  const controlled = new Set<number>();
  doc.conns.set(conn, controlled);

  const send = (payload: Uint8Array): void => {
    if (conn.readyState !== conn.OPEN && conn.readyState !== conn.CONNECTING) {
      return;
    }
    conn.send(payload, (err) => {
      if (err) closeViewer(conn, doc);
    });
  };

  const sendWriteForbidden = (): void => {
    // Out-of-band JSON error (distinct from the binary y-protocol stream) so the
    // client can surface "read-only" without corrupting the sync channel.
    if (conn.readyState === conn.OPEN) {
      conn.send(JSON.stringify({ type: "error", code: "WRITE_FORBIDDEN" }));
    }
  };

  conn.on("message", (message: ArrayBuffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(message));
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        const syncType = decoding.readVarUint(decoder);
        if (syncType === SYNC_STEP_1) {
          // Allowed: the client sent its state vector and wants ours. Read the
          // SV from the message and reply with the matching step 2 so the
          // viewer's decoder gets a well-formed frame.
          const stateVector = decoding.readVarUint8Array(decoder);
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.writeSyncStep2(encoder, doc, stateVector);
          send(encoding.toUint8Array(encoder));
        } else if (syncType === SYNC_STEP_2) {
          // The viewer's step-2 reply to our step-1 is part of the handshake,
          // not an edit — it carries their (empty) state. Ignore it; do NOT
          // apply it (that's the write block) and do NOT treat it as forbidden.
        } else if (syncType === SYNC_UPDATE) {
          // A genuine edit from the user — blocked for viewers.
          sendWriteForbidden();
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        // Awareness (cursor position, presence) is allowed for viewers.
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      }
    }
  });

  conn.on("close", () => closeViewer(conn, doc));

  // Push initial state to the viewer: sync step 1 + current awareness.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(encoding.toUint8Array(encoder));

    const states = doc.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(states.keys()),
        ),
      );
      send(encoding.toUint8Array(awarenessEncoder));
    }
  }

  // Relay live document updates + awareness to the viewer.
  const updateHandler = (update: Uint8Array): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    send(encoding.toUint8Array(encoder));
  };
  doc.on("update", updateHandler);

  const awarenessHandler = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === conn) return;
    const changed = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changed),
    );
    send(encoding.toUint8Array(encoder));
  };
  doc.awareness.on("update", awarenessHandler);

  conn.on("close", () => {
    doc.off("update", updateHandler);
    doc.awareness.off("update", awarenessHandler);
  });
};

const closeViewer = (conn: WebSocket, doc: SharedDoc): void => {
  const controlledIds = doc.conns.get(conn);
  doc.conns.delete(conn);
  if (controlledIds) {
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null,
    );
  }
  conn.close();
};
