import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import * as awarenessProtocol from "y-protocols/awareness";
import { applyUpdate } from "./yjs-shared.js";
import type { Doc as YDoc } from "./yjs-shared.js";

// Cross-instance Yjs fan-out over Redis pub/sub.
//
// Today a single ws-server holds every room in-process; two instances behind a
// load balancer would not see each other's edits or presence. This module
// mirrors each local Yjs `update` (and awareness change) to a Redis channel and
// applies the inbound ones to the matching local `Y.Doc`, so N instances
// converge on the same room.
//
// OPT-IN: when `REDIS_URL` is unset every export is a no-op and no Redis
// connection is ever opened — single-instance dev/personal runs are byte-for-
// byte the Phase 1 behaviour.
//
// Self-echo guard: remote updates are applied with the module-private
// `REDIS_ORIGIN` sentinel as the Yjs `origin`. The doc/awareness `update`
// events re-fire when we apply them, but the publish hooks below skip any event
// whose origin is that sentinel, so an applied update is never re-published —
// no infinite loop. Local edits (origin = the client connection, or null) are
// published normally. The per-instance `INSTANCE_ID` is a second guard: an
// instance ignores any message it published itself.

interface SharedAwarenessDoc extends YDoc {
  awareness: awarenessProtocol.Awareness;
}

// Sentinel origin used when applying inbound remote updates. Exported so the
// binding can recognise (and the tests can assert) the self-echo guard.
export const REDIS_ORIGIN = Symbol("redis-sync-origin");

const INSTANCE_ID = randomUUID();

const UPDATE_CHANNEL = "ohw:yjs:update";
const AWARENESS_CHANNEL = "ohw:yjs:awareness";
// A server-side actor (the web app's Cesare apply / version activate) reseeded a
// room's CRDT in the DB and asks every ws-server to drop its in-memory copy so
// connected clients reload the fresh state (BUG-N72). Unlike UPDATE_CHANNEL this
// carries no payload — just the room to evict. Published by the WEB app, not by
// a ws-server, so it is NOT filtered by INSTANCE_ID (every instance must act).
const RESEED_CHANNEL = "ohw:yjs:reseed";

interface FanoutMessage {
  instanceId: string;
  docName: string;
  // base64 of the encoded Yjs / awareness update — JSON-safe binary transport.
  payload: string;
}

// Resolve the local doc for an inbound message. Set from the binding so this
// module stays decoupled from y-websocket's `docs` map.
export type DocResolver = (docName: string) => SharedAwarenessDoc | undefined;
let resolveDoc: DocResolver = () => undefined;

// Called when a RESEED_CHANNEL message arrives: drop the in-memory room so the
// next client reload picks up the fresh DB state. Set from the binding (which
// owns the docs map + the connection lifecycle). No-op until wired.
export type ReseedHandler = (docName: string) => void;
let onReseed: ReseedHandler = () => undefined;
export const setReseedHandler = (handler: ReseedHandler): void => {
  onReseed = handler;
};

interface ReseedMessage {
  docName: string;
}

// `Redis | null`: null is the no-op (no REDIS_URL) state. ioredis needs a
// dedicated subscriber connection, so we keep a publisher and a subscriber.
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

const decodePayload = (payload: string): Uint8Array =>
  new Uint8Array(Buffer.from(payload, "base64"));

const onUpdateMessage = (raw: string): void => {
  const message = JSON.parse(raw) as FanoutMessage;
  if (message.instanceId === INSTANCE_ID) return;
  const doc = resolveDoc(message.docName);
  if (!doc) return;
  applyUpdate(doc, decodePayload(message.payload), REDIS_ORIGIN);
};

const onAwarenessMessage = (raw: string): void => {
  const message = JSON.parse(raw) as FanoutMessage;
  if (message.instanceId === INSTANCE_ID) return;
  const doc = resolveDoc(message.docName);
  if (!doc) return;
  awarenessProtocol.applyAwarenessUpdate(
    doc.awareness,
    decodePayload(message.payload),
    REDIS_ORIGIN,
  );
};

const onReseedMessage = (raw: string): void => {
  const message = JSON.parse(raw) as ReseedMessage;
  onReseed(message.docName);
};

/**
 * Connect Redis and start fan-out. No-op (and no connection) when `REDIS_URL`
 * is unset. `docResolver` maps an inbound `docName` to the local managed doc
 * (y-websocket's `docs` map). Safe to call once at startup.
 */
export const initRedisSync = async (
  docResolver: DocResolver,
): Promise<void> => {
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) return;

  resolveDoc = docResolver;

  publisher = new Redis(redisUrl);
  publisher.on("error", () => undefined);

  subscriber = new Redis(redisUrl);
  subscriber.on("error", () => undefined);
  subscriber.on("message", (channel: string, raw: string) => {
    if (channel === UPDATE_CHANNEL) onUpdateMessage(raw);
    else if (channel === AWARENESS_CHANNEL) onAwarenessMessage(raw);
    else if (channel === RESEED_CHANNEL) onReseedMessage(raw);
  });

  await subscriber.subscribe(UPDATE_CHANNEL, AWARENESS_CHANNEL, RESEED_CHANNEL);
};

const publish = (
  channel: string,
  docName: string,
  update: Uint8Array,
): void => {
  if (!publisher) return;
  const message: FanoutMessage = {
    instanceId: INSTANCE_ID,
    docName,
    payload: Buffer.from(update).toString("base64"),
  };
  // Fire-and-forget; a publish failure must never block the local edit. The
  // `error` listener on the client swallows transport errors.
  void publisher.publish(channel, JSON.stringify(message));
};

/**
 * Publish a local Yjs doc update to peers. Skips updates we applied ourselves
 * from Redis (origin === REDIS_ORIGIN) so an inbound update is never echoed
 * back — this is what prevents an infinite publish loop. No-op without Redis.
 */
export const publishUpdate = (
  docName: string,
  update: Uint8Array,
  origin: unknown,
): void => {
  if (origin === REDIS_ORIGIN) return;
  publish(UPDATE_CHANNEL, docName, update);
};

/**
 * Publish a local awareness (presence/cursor) update to peers. Same self-echo
 * guard as `publishUpdate`. No-op without Redis.
 */
export const publishAwareness = (
  docName: string,
  update: Uint8Array,
  origin: unknown,
): void => {
  if (origin === REDIS_ORIGIN) return;
  publish(AWARENESS_CHANNEL, docName, update);
};

/**
 * Ask every ws-server to drop its in-memory copy of `docName` so connected
 * clients reload the fresh DB state (BUG-N72). Published by the WEB app after it
 * reseeds a room's CRDT in the DB (Cesare apply / version activate). No-op
 * without Redis — in single-instance dev the web and ws-server SHARE the Redis,
 * so the publish reaches the local ws-server.
 */
export const publishReseed = (docName: string): void => {
  if (!publisher) return;
  const message: ReseedMessage = { docName };
  void publisher.publish(RESEED_CHANNEL, JSON.stringify(message));
};

/**
 * Wire a room's doc + awareness into the fan-out: every local update/awareness
 * change is published to peers. Called once per room (from the persistence
 * `bindState` hook, which fires when the first client connects). No-op without
 * Redis, so the listeners are only attached when fan-out is active.
 */
export const registerRoom = (
  docName: string,
  doc: SharedAwarenessDoc,
): void => {
  if (!publisher) return;

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    publishUpdate(docName, update, origin);
  });

  doc.awareness.on(
    "update",
    (
      {
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      },
      origin: unknown,
    ) => {
      if (origin === REDIS_ORIGIN) return;
      const changed = added.concat(updated, removed);
      const encoded = awarenessProtocol.encodeAwarenessUpdate(
        doc.awareness,
        changed,
      );
      publishAwareness(docName, encoded, origin);
    },
  );
};

/** Tear down the Redis fan-out on shutdown. No-op when never initialised. */
export const closeRedisSync = async (): Promise<void> => {
  if (subscriber) {
    await subscriber.unsubscribe(
      UPDATE_CHANNEL,
      AWARENESS_CHANNEL,
      RESEED_CHANNEL,
    );
    await subscriber.quit();
    subscriber = null;
  }
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
  resolveDoc = () => undefined;
};
