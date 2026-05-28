// apps/web/app/features/predictions/sessions/sessions.schema.ts
// Spec 44 WP-B — Zod schemas + inferred types for Cesare session CRUD.
//
// The server functions ingest these schemas and infer their input types from
// them; the wire shape returned to the client mirrors the Drizzle row but
// expresses timestamps as ISO strings (`createServerFn` JSON-serialises Date).

import { z } from "zod";

export const SESSION_TITLE_MAX = 80;

export const ListSessionsInput = z.object({
  projectId: z.string().uuid(),
});

export const CreateSessionInput = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(SESSION_TITLE_MAX).optional(),
});

export const RenameSessionInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(SESSION_TITLE_MAX),
});

export const DeleteSessionInput = z.object({
  id: z.string().uuid(),
});

export const TouchSessionInput = z.object({
  id: z.string().uuid(),
});

// Wire shape: Date fields become ISO strings once they cross the createServerFn
// boundary. We expose them as strings so the consuming TanStack Query cache
// stores a plain JSON value (no Date instances re-hydrating mid-flight).
export interface CesareSession {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export const DEFAULT_NEW_SESSION_TITLE = "Nuova sessione";
