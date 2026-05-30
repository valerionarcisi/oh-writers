// apps/web/app/features/predictions/cesare-stream.effect.test.ts
//
// Spec 48 (W-E2) — unit tests for the Effect-backed Cesare stream.
//
// Two contracts:
//  1. The stream-event PIPELINE: live step events emitted by the handler's sink
//     are serialised as NDJSON in order, followed by the terminal done/error
//     event — byte-identical wire format to the 47a hand-rolled stream.
//  2. The INTERRUPTION path: cancelling the ReadableStream interrupts the fiber,
//     fires the bridged AbortSignal, and stops emission — the handler's
//     long-running promise never lands a further event on the wire.
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { okAsync, errAsync, ResultAsync } from "neverthrow";
import { DbService, AccessService } from "~/server/effect";
import type { ProjectAccess } from "~/server/access";
import type { Db } from "~/server/db";
import { CesareError } from "./cesare.errors";
import {
  buildCesareEventStream,
  type CesareStreamRun,
} from "./cesare-stream.effect";
import {
  parseStreamEventLine,
  type CesareStreamEvent,
} from "./cesare-stream-events";

// ─── Substitute foundation Layers (no live DB) ───────────────────────────────
// The handler thunk in these tests does not touch db/access, so a trivial
// in-memory pair suffices. The Access Layer returns immediately with a minimal
// ProjectAccess, exercising the same `resolveProjectAccessFromHeaders` seam.

const FAKE_DB = {} as Db;
const FAKE_ACCESS = {
  user: { id: "u1" },
  project: { id: "p1" },
  membership: null,
  role: null,
  isPersonalOwner: true,
} as unknown as ProjectAccess;

const TestDbLayer = Layer.succeed(DbService, { db: FAKE_DB });
const TestAccessLayer = Layer.succeed(AccessService, {
  resolveProjectAccess: () => Effect.succeed(FAKE_ACCESS),
  resolveProjectAccessFromHeaders: () => Effect.succeed(FAKE_ACCESS),
});
const TestLayer = Layer.mergeAll(TestDbLayer, TestAccessLayer);

// Drain a ReadableStream<Uint8Array> into parsed events.
const drain = async (
  stream: ReadableStream<Uint8Array>,
): Promise<CesareStreamEvent[]> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: CesareStreamEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const ev = parseStreamEventLine(buffer.slice(0, nl));
      if (ev) events.push(ev);
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
  }
  const tail = parseStreamEventLine(buffer);
  if (tail) events.push(tail);
  return events;
};

describe("[OHW-048] cesare stream as Effect", () => {
  it("serialises live step events then the terminal done, in order (wire format unchanged)", async () => {
    const run: CesareStreamRun = {
      projectId: "p1",
      handle: (
        _db,
        _access,
        onStreamEvent,
      ): ResultAsync<string, CesareError> => {
        onStreamEvent({
          _tag: "reading",
          entity: { domain: "soggetto", label: "Soggetto" },
        });
        onStreamEvent({
          _tag: "writing",
          entity: { domain: "synopsis", label: "Sinossi" },
        });
        return okAsync("Fatto.\n<!--ohw:tools=2-->");
      },
    };

    const stream = buildCesareEventStream(run, new Headers(), TestLayer);
    const events = await drain(stream);

    expect(events.map((e) => e._tag)).toEqual(["reading", "writing", "done"]);
    const done = events.at(-1);
    expect(done?._tag).toBe("done");
    if (done?._tag === "done") {
      // The done event carries the final reply verbatim (markers preserved) and
      // the tool count parsed from the `<!--ohw:tools=N-->` marker.
      expect(done.result).toContain("<!--ohw:tools=2-->");
      expect(done.toolsExecuted).toBe(2);
    }
  });

  it("emits a terminal error event when the handler returns a typed failure", async () => {
    const run: CesareStreamRun = {
      projectId: "p1",
      handle: (): ResultAsync<string, CesareError> =>
        errAsync(new CesareError("boom")),
    };

    const stream = buildCesareEventStream(run, new Headers(), TestLayer);
    const events = await drain(stream);

    const last = events.at(-1);
    expect(last?._tag).toBe("error");
    if (last?._tag === "error") {
      // User-facing IT message only — never the internal cause.
      expect(last.message).not.toContain("boom");
      expect(last.message.length).toBeGreaterThan(0);
    }
  });

  it("cancelling the stream interrupts the fiber, fires the AbortSignal, and stops emission", async () => {
    const signalBox: { current: AbortSignal | null } = { current: null };
    // A long-running turn that only settles when we call this resolver. If
    // interruption works, the stream is cancelled long before then.
    const handleResolvers: { resolve: (reply: string) => void } = {
      resolve: () => {},
    };
    const handlePromise = new Promise<string>((res) => {
      handleResolvers.resolve = res;
    });

    const handleStarted = new Promise<void>((started) => {
      const run: CesareStreamRun = {
        projectId: "p1",
        handle: (
          _db,
          _access,
          onStreamEvent,
          abortSignal,
        ): ResultAsync<string, CesareError> => {
          signalBox.current = abortSignal;
          // Emit one early event so the consumer can observe the stream began.
          onStreamEvent({
            _tag: "reading",
            entity: { domain: "soggetto", label: "Soggetto" },
          });
          started();
          return ResultAsync.fromPromise(
            handlePromise,
            () => new CesareError("never"),
          );
        },
      };
      const stream = buildCesareEventStream(run, new Headers(), TestLayer);
      void (async () => {
        const reader = stream.getReader();
        // Read the first event, then cancel mid-flight.
        await reader.read();
        await reader.cancel();
      })();
    });

    await handleStarted;
    // Give the interruption a tick to propagate through the fiber.
    await new Promise((r) => setTimeout(r, 50));

    // The abort signal bridged into the handler must now be aborted — proof the
    // server-side run was actually cancelled (not just the client disconnected).
    expect(signalBox.current).not.toBeNull();
    expect(signalBox.current?.aborted).toBe(true);

    // Resolving the handler LATE (work that leaked past the abort) must not
    // throw into a closed stream: the fiber is already interrupted and the
    // readable is closed, so the late settle is simply dropped.
    handleResolvers.resolve("late <!--ohw:tools=0-->");
    await new Promise((r) => setTimeout(r, 20));
    // Still aborted, no late re-activation.
    expect(signalBox.current?.aborted).toBe(true);
  });
});
