import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type { ReactNode } from "react";
import { match } from "ts-pattern";
import type { CesarePage } from "~/features/predictions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationStatus = "in-progress" | "completed" | "failed";

export type AffectedEntityKind =
  | "candidate"
  | "breakdown"
  | "budget-line"
  | "schedule-day"
  | "document";

export interface AffectedEntity {
  kind: AffectedEntityKind;
  id: string;
}

/** BUG-066 — where the "Vai al <documento>" link on an applied-change row
 *  navigates. Present ONLY on completed rows whose turn actually applied an
 *  edit (honest markers); never on "sta lavorando" rows. */
export interface NotificationTarget {
  page: CesarePage;
  /** Pre-translated link label, e.g. "Vai al soggetto". */
  goToLabel: string;
}

export interface CesareNotification {
  id: string;
  status: NotificationStatus;
  startedAt: number;
  completedAt?: number;
  actionLabel: string;
  resultLabel?: string;
  errorLabel?: string;
  page: CesarePage;
  projectId: string;
  /** Whether the user has already opened the sheet for this result. */
  seen: boolean;
  affectedEntities?: AffectedEntity[];
  target?: NotificationTarget;
}

export interface StartNotificationInput {
  actionLabel: string;
  page: CesarePage;
  projectId: string;
}

export interface CompleteNotificationInput {
  resultLabel: string;
  affectedEntities?: AffectedEntity[];
  target?: NotificationTarget;
}

interface ContextValue {
  notifications: CesareNotification[];
  startNotification: (input: StartNotificationInput) => string;
  completeNotification: (id: string, result: CompleteNotificationInput) => void;
  failNotification: (id: string, errorLabel: string) => void;
  dismissNotification: (id: string) => void;
  clearCompleted: () => void;
  markAllSeen: () => void;
  hasUnseen: boolean;
}

// ─── Reducer (useReducer + ts-pattern) ────────────────────────────────────────

type State = { notifications: CesareNotification[] };

type Action =
  | { type: "start"; notification: CesareNotification }
  | {
      type: "complete";
      id: string;
      completedAt: number;
      resultLabel: string;
      affectedEntities: AffectedEntity[] | undefined;
      target: NotificationTarget | undefined;
    }
  | {
      type: "fail";
      id: string;
      completedAt: number;
      errorLabel: string;
    }
  | { type: "dismiss"; id: string }
  | { type: "clearCompleted" }
  | { type: "markAllSeen" }
  | { type: "hydrate"; notifications: CesareNotification[] };

const MAX_NOTIFICATIONS = 20;

const cap = (list: CesareNotification[]): CesareNotification[] =>
  list.length <= MAX_NOTIFICATIONS ? list : list.slice(-MAX_NOTIFICATIONS);

const reducer = (state: State, action: Action): State =>
  match(action)
    .with({ type: "start" }, (a) => ({
      notifications: cap([...state.notifications, a.notification]),
    }))
    .with({ type: "complete" }, (a) => ({
      notifications: state.notifications.map((n) =>
        n.id === a.id
          ? {
              ...n,
              status: "completed" as const,
              completedAt: a.completedAt,
              resultLabel: a.resultLabel,
              affectedEntities: a.affectedEntities,
              target: a.target,
              seen: false,
            }
          : n,
      ),
    }))
    .with({ type: "fail" }, (a) => ({
      notifications: state.notifications.map((n) =>
        n.id === a.id
          ? {
              ...n,
              status: "failed" as const,
              completedAt: a.completedAt,
              errorLabel: a.errorLabel,
              seen: false,
            }
          : n,
      ),
    }))
    .with({ type: "dismiss" }, (a) => ({
      notifications: state.notifications.filter((n) => n.id !== a.id),
    }))
    .with({ type: "clearCompleted" }, () => ({
      notifications: state.notifications.filter(
        (n) => n.status === "in-progress",
      ),
    }))
    .with({ type: "markAllSeen" }, () => ({
      notifications: state.notifications.map((n) => ({ ...n, seen: true })),
    }))
    .with({ type: "hydrate" }, (a) => ({ notifications: cap(a.notifications) }))
    .exhaustive();

// ─── Persistence helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = "ohw:cesare-notifications";

const loadFromSession = (): CesareNotification[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A reload kills any in-flight turn, so a persisted "sta lavorando" row
    // can never settle — drop it instead of resurrecting a stuck spinner
    // (BUG-066: these orphans were one source of the duplicated rows).
    return (parsed as CesareNotification[]).filter(
      (n) => n.status !== "in-progress",
    );
  } catch {
    return [];
  }
};

const saveToSession = (notifications: CesareNotification[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // sessionStorage may be unavailable (private mode); ignore.
  }
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const hasUnseenCompleted = (
  notifications: ReadonlyArray<CesareNotification>,
): boolean =>
  notifications.some(
    (n) => (n.status === "completed" || n.status === "failed") && !n.seen,
  );

const makeId = (): string => {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const CesareNotificationContext = createContext<ContextValue | null>(null);

export function CesareNotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, { notifications: [] });

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    const stored = loadFromSession();
    if (stored.length > 0) {
      dispatch({ type: "hydrate", notifications: stored });
    }
  }, []);

  // Persist on change
  useEffect(() => {
    saveToSession(state.notifications);
  }, [state.notifications]);

  const startNotification = useCallback(
    (input: StartNotificationInput): string => {
      const id = makeId();
      dispatch({
        type: "start",
        notification: {
          id,
          status: "in-progress",
          startedAt: Date.now(),
          actionLabel: input.actionLabel,
          page: input.page,
          projectId: input.projectId,
          seen: true,
        },
      });
      return id;
    },
    [],
  );

  const completeNotification = useCallback(
    (id: string, result: CompleteNotificationInput) => {
      dispatch({
        type: "complete",
        id,
        completedAt: Date.now(),
        resultLabel: result.resultLabel,
        affectedEntities: result.affectedEntities,
        target: result.target,
      });
    },
    [],
  );

  const failNotification = useCallback((id: string, errorLabel: string) => {
    dispatch({ type: "fail", id, completedAt: Date.now(), errorLabel });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    dispatch({ type: "dismiss", id });
  }, []);

  const clearCompleted = useCallback(() => {
    dispatch({ type: "clearCompleted" });
  }, []);

  const markAllSeen = useCallback(() => {
    dispatch({ type: "markAllSeen" });
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      notifications: state.notifications,
      startNotification,
      completeNotification,
      failNotification,
      dismissNotification,
      clearCompleted,
      markAllSeen,
      hasUnseen: hasUnseenCompleted(state.notifications),
    }),
    [
      state.notifications,
      startNotification,
      completeNotification,
      failNotification,
      dismissNotification,
      clearCompleted,
      markAllSeen,
    ],
  );

  return (
    <CesareNotificationContext.Provider value={value}>
      {children}
    </CesareNotificationContext.Provider>
  );
}

/**
 * True when at least one Cesare notification is still `pending` — used to
 * drive the dock-pill "thinking" glow in place of the old top-right toast.
 */
export function useCesareIsThinking(): boolean {
  const { notifications } = useCesareNotifications();
  return notifications.some((n) => n.status === "in-progress");
}

export function useCesareNotifications(): ContextValue {
  const ctx = useContext(CesareNotificationContext);
  if (!ctx) {
    // Fallback no-op for tests/storybook outside the provider
    return {
      notifications: [],
      startNotification: () => "",
      completeNotification: () => undefined,
      failNotification: () => undefined,
      dismissNotification: () => undefined,
      clearCompleted: () => undefined,
      markAllSeen: () => undefined,
      hasUnseen: false,
    };
  }
  return ctx;
}
