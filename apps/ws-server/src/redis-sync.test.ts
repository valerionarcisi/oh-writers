import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Two in-process "instances" of the fan-out share one in-memory pub/sub broker
// (a mock ioredis backed by a shared EventEmitter). We load the module twice
// via `vi.resetModules()` + dynamic import so each copy gets its own
// `INSTANCE_ID` + its own mock Redis clients, exactly like two ws-server
// processes behind a load balancer. No real Redis, pure-unit CI lane.

// Shared broker: channel -> set of subscriber callbacks. `publish` delivers
// asynchronously (next microtask) like a real pub/sub round-trip.
const broker = vi.hoisted(() => {
  const channelSubscribers = new Map<
    string,
    Set<(channel: string, message: string) => void>
  >();
  return {
    channelSubscribers,
    reset: (): void => channelSubscribers.clear(),
    deliver: (channel: string, message: string): void => {
      const subs = channelSubscribers.get(channel);
      if (!subs) return;
      for (const cb of subs) cb(channel, message);
    },
  };
});

class MockRedis extends EventEmitter {
  private readonly subscribed = new Set<string>();

  constructor(_url?: string) {
    super();
  }

  async subscribe(...channels: string[]): Promise<number> {
    for (const channel of channels) {
      this.subscribed.add(channel);
      const cb = (ch: string, msg: string): void => {
        if (this.subscribed.has(ch)) this.emit("message", ch, msg);
      };
      const existing =
        broker.channelSubscribers.get(channel) ??
        new Set<(c: string, m: string) => void>();
      existing.add(cb);
      broker.channelSubscribers.set(channel, existing);
    }
    return this.subscribed.size;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    for (const channel of channels) this.subscribed.delete(channel);
    return this.subscribed.size;
  }

  async publish(channel: string, message: string): Promise<number> {
    // Async delivery so a publish triggered from inside an `update` handler
    // doesn't re-enter synchronously — mirrors real network round-trips.
    queueMicrotask(() => broker.deliver(channel, message));
    return 1;
  }

  async quit(): Promise<"OK"> {
    return "OK";
  }
}

vi.mock("ioredis", () => ({ Redis: MockRedis }));

type RedisSyncModule = typeof import("./redis-sync.js");
import type { Awareness } from "y-protocols/awareness";

// Mirror y-websocket's WSSharedDoc: a Y.Doc with an `awareness` attached.
interface TestDoc {
  getText: (name: string) => {
    insert: (i: number, s: string) => void;
    toString: () => string;
  };
  awareness: Awareness;
}

const loadInstance = async (): Promise<{
  mod: RedisSyncModule;
  makeDoc: () => TestDoc;
}> => {
  vi.resetModules();
  const mod = await import("./redis-sync.js");
  const { Doc } = await import("./yjs-shared.js");
  const awarenessProtocol = await import("y-protocols/awareness");
  const makeDoc = (): TestDoc => {
    const doc = new Doc() as unknown as TestDoc & { setLocalState?: unknown };
    doc.awareness = new awarenessProtocol.Awareness(doc as never);
    return doc;
  };
  return { mod, makeDoc };
};

const flush = (): Promise<void> =>
  new Promise((resolve) => queueMicrotask(() => resolve()));

beforeEach(() => {
  broker.reset();
  process.env["REDIS_URL"] = "redis://mock";
});

afterEach(() => {
  delete process.env["REDIS_URL"];
});

describe("redis-sync cross-instance fan-out", () => {
  it("converges a doc: an update on instance A is applied on instance B", async () => {
    const docName = "screenplay:sp-1";

    const a = await loadInstance();
    const docA = a.makeDoc();
    await a.mod.initRedisSync((name) =>
      name === docName ? (docA as never) : undefined,
    );

    const b = await loadInstance();
    const docB = b.makeDoc();
    await b.mod.initRedisSync((name) =>
      name === docName ? (docB as never) : undefined,
    );

    // Wire A's doc to publish on local update (what registerRoom does).
    a.mod.registerRoom(docName, docA as never);

    // A real text edit so the wire bytes are a genuine Yjs update; the
    // registered handler publishes it to the shared broker.
    docA.getText("content").insert(0, "hello from A");

    await flush();
    await flush();

    expect(docB.getText("content").toString()).toBe("hello from A");
  });

  it("guards self-echo: an applied remote update is not re-published (no loop)", async () => {
    const docName = "document:doc-1";

    const a = await loadInstance();
    const docA = a.makeDoc();
    await a.mod.initRedisSync((name) =>
      name === docName ? (docA as never) : undefined,
    );
    a.mod.registerRoom(docName, docA as never);

    const b = await loadInstance();
    const docB = b.makeDoc();
    await b.mod.initRedisSync((name) =>
      name === docName ? (docB as never) : undefined,
    );
    // B also registers — if the self-echo guard were broken, B applying A's
    // update with REDIS_ORIGIN would re-publish, A would re-apply + re-publish,
    // ad infinitum. We count deliveries on the update channel.
    b.mod.registerRoom(docName, docB as never);

    let updateDeliveries = 0;
    const original = broker.deliver;
    broker.deliver = (channel, message): void => {
      if (channel === "ohw:yjs:update") updateDeliveries += 1;
      original(channel, message);
    };

    docA.getText("content").insert(0, "x");

    await flush();
    await flush();
    await flush();
    await flush();

    broker.deliver = original;

    expect(docB.getText("content").toString()).toBe("x");
    // Exactly one publish for the single edit — no echo storm.
    expect(updateDeliveries).toBe(1);
  });

  it("fans out awareness updates across instances", async () => {
    const docName = "branch:br-1";

    const a = await loadInstance();
    const docA = a.makeDoc();
    await a.mod.initRedisSync((name) =>
      name === docName ? (docA as never) : undefined,
    );

    const b = await loadInstance();
    const docB = b.makeDoc();
    await b.mod.initRedisSync((name) =>
      name === docName ? (docB as never) : undefined,
    );

    a.mod.registerRoom(docName, docA as never);

    docA.awareness.setLocalStateField("user", { name: "Valerio" });

    await flush();
    await flush();

    const states = Array.from(docB.awareness.getStates().values());
    expect(states).toContainEqual({ user: { name: "Valerio" } });
  });

  it("is a no-op when REDIS_URL is unset (Phase 1 behaviour)", async () => {
    delete process.env["REDIS_URL"];

    const a = await loadInstance();
    const docA = a.makeDoc();
    await a.mod.initRedisSync(() => undefined);
    a.mod.registerRoom("screenplay:sp-2", docA as never);

    let deliveries = 0;
    const original = broker.deliver;
    broker.deliver = (channel, message): void => {
      deliveries += 1;
      original(channel, message);
    };

    docA.getText("content").insert(0, "no redis");
    await flush();
    await flush();

    broker.deliver = original;

    // Nothing published: registerRoom returned early because no publisher.
    expect(deliveries).toBe(0);

    await expect(a.mod.closeRedisSync()).resolves.toBeUndefined();
  });
});
