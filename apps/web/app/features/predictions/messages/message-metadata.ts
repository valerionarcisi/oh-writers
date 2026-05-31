// apps/web/app/features/predictions/messages/message-metadata.ts
// Spec 51 (step 1) — bridge the runtime reducer ChatMessage ⇄ the persisted wire
// shape. Pure, no React: extracts the trace + edit markers from a delivered
// assistant message for persistence, and rebuilds a reducer ChatMessage from a
// loaded persisted row for hydration.
//
// The edit markers are derived from the `<!--ohw:doc-applied:…-->` markers the
// server embeds in the assistant reply (the SAME data the live diff uses). We
// only record the version ids + entity here; the changelog markdown is DERIVED
// from `document_versions`, never stored.
import type { ChatMessage, TraceStep } from "../use-cesare-chat-reducer";
import type { EntityRef } from "../cesare-stream-events";
import type {
  CesareMessage,
  MessageMetadata,
  PersistedEditMarker,
  PersistedTraceStep,
} from "./messages.schema";

const DOC_APPLIED_PATTERN = /<!--ohw:doc-applied:([\s\S]*?)-->/g;

// All doc-applied markers in a turn (a cross-entity edit emits several).
export const extractEditMarkers = (content: string): PersistedEditMarker[] => {
  const markers: PersistedEditMarker[] = [];
  for (const m of content.matchAll(DOC_APPLIED_PATTERN)) {
    if (!m[1]) continue;
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (typeof parsed["version_id"] !== "string") continue;
      const previous = parsed["previous_version_id"];
      markers.push({
        documentType: String(parsed["document_type"] ?? ""),
        versionId: parsed["version_id"],
        previousVersionId: typeof previous === "string" ? previous : null,
      });
    } catch {
      // best-effort: a malformed marker is skipped, never throws
    }
  }
  return markers;
};

const traceToPersisted = (step: TraceStep): PersistedTraceStep => ({
  kind: step.kind,
  entity: step.entity
    ? { domain: step.entity.domain, label: step.entity.label }
    : null,
  text: step.text,
});

// Build the metadata payload for a delivered assistant message.
export const buildAssistantMetadata = (
  message: ChatMessage,
): MessageMetadata => ({
  trace: message.trace.map(traceToPersisted),
  edits: extractEditMarkers(message.content),
});

const persistedToTrace = (step: PersistedTraceStep): TraceStep => ({
  kind: step.kind,
  // The persisted entity carries domain + label, the exact subset the reducer's
  // EntityRef needs for rendering reading/writing labels. The domain string was
  // validated against the same vocabulary on the way in (StreamEntityDomain).
  entity: step.entity
    ? ({ domain: step.entity.domain, label: step.entity.label } as EntityRef)
    : null,
  text: step.text,
});

// Rebuild a reducer ChatMessage from a loaded persisted row (hydration). Loaded
// messages are always settled, so status is "delivered".
export const persistedToChatMessage = (row: CesareMessage): ChatMessage => ({
  id: row.id,
  role: row.role,
  content: row.content,
  status: "delivered",
  trace:
    row.role === "assistant" && row.metadata
      ? row.metadata.trace.map(persistedToTrace)
      : [],
});
