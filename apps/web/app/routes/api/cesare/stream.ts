import { createAPIFileRoute } from "@tanstack/start/api";
import {
  resolveCesareStreamAccess,
  runCesareStreamWithAccess,
  CesareInputSchema,
} from "~/features/predictions/cesare.server";
import { buildCesareEventStream } from "~/features/predictions/cesare-stream.effect";
import { logger } from "~/server/logger";

/**
 * Spec 47a (A2) — streamed Cesare transport.
 * Spec 48 (W-E2) — the run is now an Effect fiber with structured interruption.
 *
 * `POST /api/cesare/stream` runs the SAME V2 handler `askCesare` uses, but emits
 * typed step events (`reasoning | reading | writing | tool | done | error`) as
 * newline-delimited JSON over a `ReadableStream` while the tool loop runs. It is
 * page-agnostic and domain-agnostic — every Cesare page posts here.
 *
 * The wire format is UNCHANGED from 47a; what changed in W-E2 is the SERVER
 * orchestration: the body is backed by an Effect fiber (under the W-E1
 * Db/Access/AiClient Layers) so that when the browser aborts the fetch, the
 * `ReadableStream.cancel` callback interrupts the fiber and the bridged
 * `AbortSignal` tears down the in-flight model call — no leaked work. See
 * `cesare-stream.effect.ts`.
 *
 * Auth: project access is gated TWICE with identical semantics, both from the
 * request's OWN headers via `resolveProjectAccessFromHeaders` (the auth fix):
 *  1. a pre-flight neverthrow check here, so a denied caller gets HTTP 403
 *     before any stream opens (the exact status contract the client relies on);
 *  2. inside the Effect, through the Access Layer — the canonical W-E1 seam the
 *     fiber consumes. The Anthropic key never reaches the client.
 *
 * The non-streaming `askCesare` server function stays as the fallback for
 * callers that cannot consume a stream.
 */
export const APIRoute = createAPIFileRoute("/api/cesare/stream")({
  POST: async ({ request }) => {
    const rawBody = await request.json().catch(() => null);
    const parsed = CesareInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = parsed.data;

    // Pre-flight access check (HTTP 403 contract). Resolve from the request's
    // OWN headers — `getWebRequest()` is not reliably populated inside an API
    // route's POST handler, which silently dropped the Better Auth session and
    // 403'd every browser stream.
    const accessResult = await resolveCesareStreamAccess(
      data.projectId,
      request.headers,
    );
    if (accessResult.isErr()) {
      logger.warn(
        { tag: accessResult.error._tag, projectId: data.projectId },
        "cesare.stream.access_denied",
      );
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Hand the run to the Effect fiber. It re-resolves access through the
    // Access Layer (canonical W-E1 seam) and runs the SAME V2 handler with the
    // live step-event sink and the fiber's abort signal threaded in. Step events
    // were already emitted live; the fiber pushes the terminal done/error.
    const stream = buildCesareEventStream(
      {
        projectId: data.projectId,
        handle: (db, access, onStreamEvent, abortSignal) =>
          runCesareStreamWithAccess(
            data,
            { db, access },
            onStreamEvent,
            abortSignal,
          ),
      },
      request.headers,
    );

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  },
});
