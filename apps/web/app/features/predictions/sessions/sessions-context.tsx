// apps/web/app/features/predictions/sessions/sessions-context.tsx
/**
 * SessionsProvider — single source of truth for the active Cesare session.
 *
 * Spec 44 (sessions menu): sessions live in the LeftRail, not inside the
 * Cesare drawer header. The rail + the drawer + any other consumer (Cesare
 * server callers, headers, command-palette entries) read the same active
 * session id from this context so the surface always stays in sync.
 *
 * Responsibilities:
 *   - Read the project's sessions via TanStack Query (`useSessions`).
 *   - Hold the user's active session id and persist it per
 *     `projectId × userId` in `localStorage`, so reloads + tab swaps land on
 *     the same chat thread.
 *   - Expose mutation helpers (`createSession`, `renameSession`,
 *     `deleteSession`) wrapped around the existing TanStack Query hooks.
 *
 * The provider is mounted high enough to wrap both the LeftRail (in
 * `_app.tsx`) and the CesareSheet (inside AppShellInner) — see `AppShell.tsx`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useSessions,
  useCreateSession,
  useRenameSession,
  useDeleteSession,
} from "./useSessions";
import type { CesareSession } from "./sessions.schema";

// ─── Public types ────────────────────────────────────────────────────────────

export interface SessionsContextValue {
  /** Current project's sessions, ordered by lastMessageAt desc. */
  sessions: ReadonlyArray<CesareSession>;
  /** Active session id, or `null` until the first query response lands. */
  activeSessionId: string | null;
  /** Set the active session id; also persists to localStorage. */
  setActiveSession: (sessionId: string | null) => void;
  /** Create a new session and immediately activate it. */
  createSession: (title?: string) => Promise<CesareSession>;
  /** Rename a session by id. */
  renameSession: (input: { id: string; title: string }) => Promise<CesareSession>;
  /** Delete a session by id. If it was the active one, clear the active id. */
  deleteSession: (id: string) => Promise<{ id: string }>;
  /** True while the sessions list is loading. */
  isLoading: boolean;
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

const STORAGE_PREFIX = "ohw.cesare.activeSession.";

const buildStorageKey = (projectId: string, userId: string): string =>
  `${STORAGE_PREFIX}${projectId}.${userId}`;

const readPersistedActiveSessionId = (
  projectId: string | null,
  userId: string | null,
): string | null => {
  if (!projectId || !userId) return null;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(buildStorageKey(projectId, userId));
  } catch {
    return null;
  }
};

const writePersistedActiveSessionId = (
  projectId: string | null,
  userId: string | null,
  sessionId: string | null,
): void => {
  if (!projectId || !userId) return;
  if (typeof window === "undefined") return;
  try {
    const key = buildStorageKey(projectId, userId);
    if (sessionId === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, sessionId);
    }
  } catch {
    // localStorage may be unavailable (private mode, iframe). Ignore.
  }
};

// ─── Context ────────────────────────────────────────────────────────────────

const noopAsync = <T,>(): Promise<T> =>
  Promise.reject(
    new Error("SessionsProvider not mounted — calls are no-ops outside it"),
  );

const DEFAULT_CONTEXT: SessionsContextValue = {
  sessions: [],
  activeSessionId: null,
  setActiveSession: () => undefined,
  createSession: () => noopAsync<CesareSession>(),
  renameSession: () => noopAsync<CesareSession>(),
  deleteSession: () => noopAsync<{ id: string }>(),
  isLoading: false,
};

const SessionsContext =
  createContext<SessionsContextValue>(DEFAULT_CONTEXT);

interface SessionsProviderProps {
  /** Required: scopes the sessions query + storage key. */
  projectId: string;
  /** Required: pairs with projectId to namespace the persisted active id. */
  userId: string;
  children: ReactNode;
}

export function SessionsProvider({
  projectId,
  userId,
  children,
}: SessionsProviderProps) {
  const sessionsQuery = useSessions(projectId);
  const createMutation = useCreateSession(projectId);
  const renameMutation = useRenameSession(projectId);
  const deleteMutation = useDeleteSession(projectId);

  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(
    () => readPersistedActiveSessionId(projectId, userId),
  );

  // Re-read persisted id when projectId or userId changes (route swap, sign
  // in/out). Without this guard a stale active id would carry across projects.
  useEffect(() => {
    setActiveSessionIdState(readPersistedActiveSessionId(projectId, userId));
  }, [projectId, userId]);

  const sessions = sessionsQuery.data ?? [];

  // Default the active session to the most-recent one once data has loaded.
  // The list is already ordered by `lastMessageAt` desc on the server.
  useEffect(() => {
    if (sessions.length === 0) return;
    if (activeSessionId && sessions.some((s) => s.id === activeSessionId)) {
      return;
    }
    const first = sessions[0];
    if (first) {
      setActiveSessionIdState(first.id);
      writePersistedActiveSessionId(projectId, userId, first.id);
    }
    // We intentionally depend on the array reference + activeSessionId so the
    // default reseeds when sessions reload.
  }, [sessions, activeSessionId, projectId, userId]);

  const setActiveSession = useCallback(
    (sessionId: string | null) => {
      setActiveSessionIdState(sessionId);
      writePersistedActiveSessionId(projectId, userId, sessionId);
    },
    [projectId, userId],
  );

  const createSession = useCallback(
    async (title?: string): Promise<CesareSession> => {
      const next = await createMutation.mutateAsync(title);
      setActiveSession(next.id);
      return next;
    },
    [createMutation, setActiveSession],
  );

  const renameSession = useCallback(
    (input: { id: string; title: string }): Promise<CesareSession> =>
      renameMutation.mutateAsync(input),
    [renameMutation],
  );

  const deleteSession = useCallback(
    async (id: string): Promise<{ id: string }> => {
      const result = await deleteMutation.mutateAsync(id);
      if (activeSessionId === id) {
        setActiveSession(null);
      }
      return result;
    },
    [deleteMutation, activeSessionId, setActiveSession],
  );

  const value = useMemo<SessionsContextValue>(
    () => ({
      sessions,
      activeSessionId,
      setActiveSession,
      createSession,
      renameSession,
      deleteSession,
      isLoading: sessionsQuery.isLoading,
    }),
    [
      sessions,
      activeSessionId,
      setActiveSession,
      createSession,
      renameSession,
      deleteSession,
      sessionsQuery.isLoading,
    ],
  );

  return (
    <SessionsContext.Provider value={value}>
      {children}
    </SessionsContext.Provider>
  );
}

/**
 * Read the SessionsContext. Returns inert defaults when no provider is
 * mounted so isolated callers (Storybook, unit tests) stay safe.
 */
export function useSessionsContext(): SessionsContextValue {
  return useContext(SessionsContext);
}
