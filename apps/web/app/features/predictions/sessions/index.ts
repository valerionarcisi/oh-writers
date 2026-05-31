// apps/web/app/features/predictions/sessions/index.ts
// Spec 44 WP-B — barrel for the Cesare sessions sub-domain.

export {
  ListSessionsInput,
  CreateSessionInput,
  RenameSessionInput,
  DeleteSessionInput,
  TouchSessionInput,
  GetSessionInput,
  DEFAULT_NEW_SESSION_TITLE,
  DEFAULT_PRIMARY_SESSION_TITLE,
  PLACEHOLDER_SESSION_TITLES,
  isPlaceholderSessionTitle,
  SESSION_TITLE_MAX,
} from "./sessions.schema";
export type { CesareSession } from "./sessions.schema";
export { deriveSessionTitle, DERIVED_TITLE_MAX } from "./derive-session-title";
export { CesareSessionNotFoundError } from "./sessions.errors";
export {
  sessionsQueryKey,
  sessionQueryKey,
  sessionsQueryOptions,
  sessionQueryOptions,
  useSessions,
  useSession,
  useCreateSession,
  useRenameSession,
  useDeleteSession,
} from "./useSessions";
// server fns intentionally NOT re-exported here — import directly from
// ./sessions.server in server-only code paths.
