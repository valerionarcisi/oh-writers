import { createAPIFileRoute } from "@tanstack/start/api";
import {
  resolveCesareStreamAccess,
  runCesareStreamWithAccess,
  CesareInputSchema,
} from "~/features/predictions/cesare.server";
import {
  encodeStreamEvent,
  parseToolsExecutedMarker,
  type CesareStreamEvent,
} from "~/features/predictions/cesare-stream-events";
import { logger } from "~/server/logger";

/**
 * Spec 47a (A2) — streamed Cesare transport.
 *
 * `POST /api/cesare/stream` runs the SAME V2 handler `askCesare` uses, but emits
 * typed step events (`reasoning | reading | writing | tool | done | error`) as
 * newline-delimited JSON over a `ReadableStream` while the tool loop runs. It is
 * page-agnostic and domain-agnostic — every Cesare page posts here. Auth +
 * project access are enforced inside `runCesareStream` via `withProjectAccess`,
 * so the Anthropic key never leaves the server.
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

    // Resolve project access NOW, while the ambient request context
    // (`getWebRequest`) is still live — it is NOT available inside the stream's
    // async `start` callback below.
    const accessResult = await resolveCesareStreamAccess(data.projectId);
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
    const access = accessResult.value;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: CesareStreamEvent): void => {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
        };

        // The handler returns a neverthrow Result; we translate it into the
        // terminal `done` / `error` events. Step events were already emitted
        // live via the `emit` sink while the loop ran.
        const result = await runCesareStreamWithAccess(data, access, emit);

        result.match(
          (reply) => {
            emit({
              _tag: "done",
              result: reply,
              toolsExecuted: parseToolsExecutedMarker(reply),
            });
          },
          (error) => {
            // Log the internal cause; send a user-facing IT message only.
            logger.warn(
              { tag: error._tag, projectId: data.projectId },
              "cesare.stream.failed",
            );
            emit({
              _tag: "error",
              message: "Mi dispiace, si è verificato un errore. Riprova.",
            });
          },
        );

        controller.close();
      },
    });

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
