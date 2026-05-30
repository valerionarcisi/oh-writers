// apps/web/app/features/predictions/cesare-stream.effect.ts
//
// Spec 48 (W-E2) — the Cesare streamed turn modelled as an Effect.
//
// The streamed Cesare path used to be a bare `ReadableStream` whose `start`
// callback `await`ed a neverthrow `ResultAsync` (`runCesareStreamWithAccess`).
// It had no `cancel`, so when the browser aborted the fetch (drawer closed,
// navigation, dropped connection) the server-side tool loop kept running:
// leaked model calls, dangling tool executions.
//
// Here the run is an Effect fiber, gated by the W-E1 foundation Layers
// (`DbService` / `AccessService`). The headline win is STRUCTURED INTERRUPTION:
// the `ReadableStream.cancel` callback interrupts the fiber, the fiber's
// finalizer aborts an `AbortController` that is bridged into the AI SDK
// `generateText` call, and the model request tears down. Cleanup is guaranteed
// by the fiber, not by hand.
//
// The wire format is UNCHANGED — the same NDJSON typed events
// (`reasoning | reading | writing | tool | done | error`), the same
// `<!--ohw:…-->` markers inside `done.result`, the same auth (project access
// resolved from the request `Headers` via the Access Layer's
// `resolveProjectAccessFromHeaders`). The client (`cesare-stream-client.ts`)
// needs no change.
import { Effect, Exit, Fiber, Layer, Queue, Scope } from "effect";
import type { ResultAsync } from "neverthrow";
import { DbService, AccessService, AiContextLayer } from "~/server/effect";
import type { ProjectAccess, ProjectAccessError } from "~/server/access";
import type { Db } from "~/server/db";
import {
  encodeStreamEvent,
  parseToolsExecutedMarker,
  type CesareStreamEvent,
} from "./cesare-stream-events";
import { CesareError } from "./cesare.errors";
import { logger } from "~/server/logger";

/**
 * The streamed run as data: the project id (used for access resolution +
 * logging) plus the V2 handler bound as a thunk. Kept structural so this module
 * stays free of the handler's large dependency graph; the route — which owns
 * the validated input — supplies `handle`.
 */
export interface CesareStreamRun {
  readonly projectId: string;
  /**
   * Runs the SAME V2 handler the non-streaming `askCesare` uses, with the live
   * step-event sink and the fiber's abort signal threaded in. Returns the final
   * assistant reply (still carrying the `<!--ohw:…-->` markers) as a neverthrow
   * `ResultAsync`.
   */
  readonly handle: (
    db: Db,
    access: ProjectAccess,
    onStreamEvent: (event: CesareStreamEvent) => void,
    abortSignal: AbortSignal,
  ) => ResultAsync<string, CesareError>;
}

// An internal end-of-stream sentinel pushed into the queue when the fiber
// settles WITHOUT a terminal event (interruption / defect). On the normal path
// the fiber pushes a `done`/`error` event, then this sentinel, so a blocked
// `take` always wakes and `pull` can close the stream deterministically.
const END = Symbol("cesare-stream-end");
type QueueItem = CesareStreamEvent | typeof END;

// ─── Internal: drive one run, emitting into an Effect Queue ───────────────────
//
// `R` requires the foundation Layers (Db + Access). Access is resolved from the
// request headers (the auth fix), then the handler is bridged from neverthrow
// into Effect. The terminal `done` / `error` event is offered last, mirroring
// the previous `result.match(...)` exactly.

const runIntoQueue = (
  run: CesareStreamRun,
  headers: Headers,
  queue: Queue.Queue<QueueItem>,
  abortController: AbortController,
): Effect.Effect<void, never, DbService | AccessService | Scope.Scope> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const accessService = yield* AccessService;

    // The fiber owns the abort controller. On interruption (stream cancelled),
    // success, or failure this finalizer aborts the in-flight model request so
    // no server work leaks.
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (!abortController.signal.aborted) abortController.abort();
      }),
    );

    // Auth: resolve project access from the request's OWN headers (not the
    // ambient request context, which is not reliably populated inside a stream
    // body). Identical semantics to the previous `resolveCesareStreamAccess`.
    const access: ProjectAccess = yield* accessService
      .resolveProjectAccessFromHeaders(run.projectId, "view", headers)
      .pipe(
        Effect.catchAll((error: ProjectAccessError) =>
          // Access errors here are unexpected: the route already gated access
          // before opening the stream. Surface as a defect so the boundary
          // re-throws rather than fabricating a fake domain reply.
          Effect.die(
            new CesareError(`stream access resolution failed: ${error._tag}`),
          ),
        ),
      );

    // Bridge the neverthrow handler into Effect. The live step events are
    // emitted into the queue via the sink while the loop runs; here we only
    // translate the settled Result into the terminal event.
    const settled = yield* Effect.promise(() =>
      run.handle(
        db,
        access,
        (event) => {
          // Unbounded queue → this offer never blocks the tool-loop callback.
          Queue.unsafeOffer(queue, event);
        },
        abortController.signal,
      ),
    );

    if (settled.isOk()) {
      yield* Queue.offer(queue, {
        _tag: "done",
        result: settled.value,
        toolsExecuted: parseToolsExecutedMarker(settled.value),
      });
    } else {
      // Log the internal cause tag; the user-facing IT message carries none of
      // it — identical to the previous route's `result.match` error branch.
      logger.warn(
        { tag: settled.error._tag, projectId: run.projectId },
        "cesare.stream.failed",
      );
      yield* Queue.offer(queue, {
        _tag: "error",
        message: "Mi dispiace, si è verificato un errore. Riprova.",
      });
    }
  });

// ─── Public: build the NDJSON ReadableStream backed by an Effect fiber ────────

/**
 * Build the response `ReadableStream<Uint8Array>` for one Cesare turn.
 *
 * The run is an Effect fiber under the foundation Layers. Events flow through an
 * Effect `Queue`; `pull` drains it into NDJSON bytes; `cancel` (fired when the
 * browser aborts the fetch) interrupts the fiber so the bridged `AbortSignal`
 * aborts the AI SDK call. The fiber's finalizers guarantee cleanup.
 *
 * The byte output is identical to the previous hand-rolled stream: one NDJSON
 * line per event, the terminal `done`/`error` last, then close.
 */
export const buildCesareEventStream = (
  run: CesareStreamRun,
  headers: Headers,
  // The foundation Layer the fiber runs under. Defaults to the production
  // `AiContextLayer` (Db + Access + AiClient + Observability). Tests inject a
  // substitute Db/Access Layer so the stream pipeline + interruption path can be
  // exercised without a live database — the same test seam W-E1's ACL uses.
  layer: Layer.Layer<DbService | AccessService> = AiContextLayer,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  // The scope owns the run's finalizers (the abort bridge); the queue is a
  // plain unbounded queue. Both are created synchronously so the fiber and the
  // stream share one lifecycle.
  const scope = Effect.runSync(Scope.make());
  const queue = Effect.runSync(Queue.unbounded<QueueItem>());

  // Fork the run as a fiber, fully provided, extended into the shared scope so
  // its finalizers live as long as the stream. When the fiber settles (any
  // exit), close the scope (runs finalizers) and push END so a blocked `pull`
  // always wakes and can close the response.
  const program = runIntoQueue(run, headers, queue, abortController).pipe(
    Scope.extend(scope),
    Effect.provide(layer),
    Effect.onExit(() =>
      Effect.zipRight(Scope.close(scope, Exit.void), Queue.offer(queue, END)),
    ),
  );

  const fiber = Effect.runFork(program);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Block until the next item. A real event is enqueued; END closes the
      // stream. `take` only resolves to END once the fiber has fully settled.
      const item = await Effect.runPromise(Queue.take(queue));
      if (item === END) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(encodeStreamEvent(item)));
    },
    cancel() {
      // The browser aborted the fetch. Interrupt the fiber: its finalizer
      // aborts the AbortController, the AI SDK call tears down, the scope
      // closes — guaranteed cleanup, no leaked work. `onExit` then pushes END,
      // but `cancel` already ended the readable, so it is simply drained.
      Effect.runFork(Fiber.interrupt(fiber));
    },
  });
};
