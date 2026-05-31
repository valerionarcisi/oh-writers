// apps/web/app/features/predictions/messages/messages.schema.ts
// Spec 51 — Zod schemas + inferred types for persisted Cesare chat messages.
//
// A message belongs to a `cesare_sessions` thread. Assistant messages may carry
// `metadata`: the live step trace the reducer rendered (reading/reasoning/…) and
// the per-edit markers (the touched entity + the version ids of the auto-created
// version) that turn produced. The metadata is OPTIONAL enrichment used to
// derive the transcript markdown — never the authoritative edit record (that is
// `document_versions` + the diff markers). Persisting it lets us re-render the
// trace + link to the per-edit changelog without re-running the model.

import { z } from "zod";

// One live trace step (mirrors the reducer's TraceStep, kept here as the wire
// contract so persistence does not couple to the React reducer module).
export const PersistedTraceStepSchema = z.object({
  kind: z.enum(["reasoning", "reading", "writing", "tool"]),
  // Mirrors the reducer's TraceStep.entity (EntityRef | null): the touched
  // entity for reading/writing steps, null for reasoning/tool.
  entity: z
    .object({
      domain: z.string(),
      label: z.string(),
    })
    .nullable(),
  text: z.string(),
});
export type PersistedTraceStep = z.infer<typeof PersistedTraceStepSchema>;

// One edit an assistant turn applied LIVE (parsed from the `ohw:doc-applied`
// marker). The version ids point into `document_versions`; the changelog
// markdown is DERIVED from those, never stored here.
export const PersistedEditMarkerSchema = z.object({
  documentType: z.string(),
  versionId: z.string(),
  previousVersionId: z.string().nullable(),
});
export type PersistedEditMarker = z.infer<typeof PersistedEditMarkerSchema>;

export const MessageMetadataSchema = z.object({
  trace: z.array(PersistedTraceStepSchema).default([]),
  edits: z.array(PersistedEditMarkerSchema).default([]),
});
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

const MAX_CONTENT = 20_000;

// One turn = an optimistic user bubble + its assistant reply. We persist the
// pair together (after the turn settles) so the thread is always consistent and
// a single round-trip records the conversation. The assistant carries metadata.
export const PersistTurnInput = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid(),
  userContent: z.string().trim().min(1).max(MAX_CONTENT),
  assistantContent: z.string().trim().min(1).max(MAX_CONTENT),
  metadata: MessageMetadataSchema.optional(),
});
export type PersistTurnInputType = z.infer<typeof PersistTurnInput>;

export const ListMessagesInput = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

// Spec 51 — input for the DERIVED history markdown endpoints (changelog +
// transcript). Same shape as listing; named distinctly for call-site clarity.
export const SessionHistoryInput = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

// Wire shape: Date becomes an ISO string across the createServerFn boundary.
export interface CesareMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  metadata: MessageMetadata | null;
  createdAt: string;
}
