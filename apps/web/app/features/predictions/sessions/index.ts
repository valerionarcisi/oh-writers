// apps/web/app/features/predictions/sessions/index.ts
// Spec 44 WP-B — barrel for the Cesare sessions sub-domain.

export {
  ListSessionsInput,
  CreateSessionInput,
  RenameSessionInput,
  DeleteSessionInput,
  TouchSessionInput,
  DEFAULT_NEW_SESSION_TITLE,
  SESSION_TITLE_MAX,
} from "./sessions.schema";
export type { CesareSession } from "./sessions.schema";
export { CesareSessionNotFoundError } from "./sessions.errors";
export {
  sessionsQueryKey,
  sessionsQueryOptions,
  useSessions,
  useCreateSession,
  useRenameSession,
  useDeleteSession,
} from "./useSessions";
// server fns intentionally NOT re-exported here — import directly from
// ./sessions.server in server-only code paths.
