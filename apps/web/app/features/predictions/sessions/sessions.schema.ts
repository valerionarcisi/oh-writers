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

// Fetch a single session for the central `/sessions/:sessionId` route. Both
// ids are required so the ownership guard can fail closed when the session
// belongs to a different project than the one in the URL (no cross-project
// leak).
export const GetSessionInput = z.object({
  id: z.string().uuid(),
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

// LeftRail pinning (rail cap + "Vedi tutte"). At most MAX_PINNED_SESSIONS
// sessions per project can be pinned at once — enforced server-side.
export const MAX_PINNED_SESSIONS = 3;

export const PinSessionInput = z.object({
  id: z.string().uuid(),
  pinned: z.boolean(),
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
  /** ISO timestamp when the session was pinned, or `null` when unpinned. */
  pinnedAt: string | null;
}

export const DEFAULT_NEW_SESSION_TITLE = "Nuova sessione";

// The seed/default session created by the migration and by `ensureDefaultSession`.
export const DEFAULT_PRIMARY_SESSION_TITLE = "Sessione principale";

// Titles that auto-naming is allowed to overwrite (Spec 53): the two
// system-provided placeholders. A title outside this set was set by the user
// (rename) or already derived from a first message — never overwrite it.
export const PLACEHOLDER_SESSION_TITLES: ReadonlySet<string> = new Set([
  DEFAULT_NEW_SESSION_TITLE,
  DEFAULT_PRIMARY_SESSION_TITLE,
]);

export const isPlaceholderSessionTitle = (title: string): boolean =>
  PLACEHOLDER_SESSION_TITLES.has(title.trim());
