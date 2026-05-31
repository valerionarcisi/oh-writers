// apps/web/app/features/predictions/cesare-stream-client.ts
//
// Spec 47a (A2) — client transport for the streamed Cesare endpoint.
//
// `streamCesare` POSTs to `/api/cesare/stream`, reads the NDJSON body, parses
// each line into a typed `CesareStreamEvent`, and invokes `onEvent` as events
// arrive. It is browser-only (uses `fetch` + `ReadableStream`), so it lives in
// the feature folder, never in a shared package.
import {
  parseStreamEventLine,
  type CesareStreamEvent,
} from "./cesare-stream-events";
import type { CesarePage } from "./components/CesareSheet";

export interface StreamCesareInput {
  readonly projectId: string;
  readonly message: string;
  readonly pageContext: {
    readonly page: CesarePage;
    readonly sceneId: string | null;
    readonly sceneNumber: number | null;
    readonly requirementId?: string | null;
    readonly documentId?: string | null;
    readonly shootingDayId?: string | null;
    readonly shootingDayNumber?: number | null;
  };
  readonly conversationHistory: ReadonlyArray<{
    readonly role: "user" | "assistant";
    readonly content: string;
  }>;
}

/**
 * Stream a Cesare turn. Resolves once the body is fully consumed. Throws only on
 * a transport-level failure (network down, non-OK status, no body) so the caller
 * can fall back to the non-streaming `askCesare` path; per-line parse failures
 * are swallowed (a malformed line is an expected, recoverable condition).
 */
export const streamCesare = async (
  input: StreamCesareInput,
  onEvent: (event: CesareStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await fetch("/api/cesare/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `credentials: "include"` is REQUIRED: the stream route resolves the
    // Better Auth session from the request cookie. A programmatic `fetch` does
    // not attach the session cookie by default, so without this the route
    // resolves no session and returns 403 (ForbiddenError: read project) —
    // surfacing in the UI as "Invio non riuscito". E2E missed this because
    // Playwright's `request.post` always carries the storage-state cookie.
    credentials: "include",
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok || !response.body) {
    throw new Error(`cesare stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // NDJSON: split on newlines, keep the trailing partial line in `buffer`.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const event = parseStreamEventLine(line);
      if (event) onEvent(event);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  // Flush any trailing line without a newline terminator.
  const tail = parseStreamEventLine(buffer);
  if (tail) onEvent(tail);
};
