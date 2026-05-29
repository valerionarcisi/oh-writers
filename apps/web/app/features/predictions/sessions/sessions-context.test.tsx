// @vitest-environment jsdom
// apps/web/app/features/predictions/sessions/sessions-context.test.tsx
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { renderHook, render, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionsProvider, useSessionsContext } from "./sessions-context";
import { sessionsQueryKey } from "./useSessions";
import type { CesareSession } from "./sessions.schema";

const PROJECT_A = "00000000-0000-0000-0000-000000000001";
const PROJECT_B = "00000000-0000-0000-0000-000000000002";
const USER_X = "11111111-1111-1111-1111-111111111111";
const USER_Y = "22222222-2222-2222-2222-222222222222";

const buildSession = (
  id: string,
  title: string,
  projectId: string,
  userId: string,
  iso = "2026-05-29T10:00:00.000Z",
): CesareSession => ({
  id,
  projectId,
  userId,
  title,
  lastMessageAt: iso,
  createdAt: iso,
});

// jsdom doesn't ship a working localStorage by default in our vitest config;
// install an in-memory mock just for this suite. Same approach as the
// CesareDrawer resize tests.
function installMockLocalStorage(): Storage {
  const store = new Map<string, string>();
  const mock: Storage = {
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: mock,
  });
  return mock;
}

const wrapperWith = (qc: QueryClient, projectId: string, userId: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <SessionsProvider projectId={projectId} userId={userId}>
          {children}
        </SessionsProvider>
      </QueryClientProvider>
    );
  };

const buildQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

describe("SessionsProvider", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMockLocalStorage();
  });

  afterEach(() => {
    cleanup();
    storage.clear();
  });

  it("returns the sessions array seeded into the query cache", () => {
    const qc = buildQueryClient();
    const seeded = [
      buildSession("s1", "Breakdown Sc.2", PROJECT_A, USER_X),
      buildSession("s2", "Riscrivi Atto II", PROJECT_A, USER_X),
    ];
    qc.setQueryData(sessionsQueryKey(PROJECT_A), seeded);

    const { result } = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qc, PROJECT_A, USER_X),
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0]?.id).toBe("s1");
  });

  it("defaults the active session to the first sessions entry when no id is persisted", () => {
    const qc = buildQueryClient();
    const seeded = [
      buildSession("s1", "Recente", PROJECT_A, USER_X),
      buildSession("s2", "Vecchia", PROJECT_A, USER_X),
    ];
    qc.setQueryData(sessionsQueryKey(PROJECT_A), seeded);

    const { result } = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qc, PROJECT_A, USER_X),
    });

    expect(result.current.activeSessionId).toBe("s1");
  });

  it("persists the active id under the (projectId, userId) key", () => {
    const qc = buildQueryClient();
    const seeded = [buildSession("s1", "Una", PROJECT_A, USER_X)];
    qc.setQueryData(sessionsQueryKey(PROJECT_A), seeded);

    const { result } = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qc, PROJECT_A, USER_X),
    });

    act(() => result.current.setActiveSession("s1"));

    const expectedKey = `ohw.cesare.activeSession.${PROJECT_A}.${USER_X}`;
    expect(storage.getItem(expectedKey)).toBe("s1");
  });

  it("namespaces persistence per (projectId, userId)", () => {
    const expectedKeyA = `ohw.cesare.activeSession.${PROJECT_A}.${USER_X}`;
    const expectedKeyB = `ohw.cesare.activeSession.${PROJECT_B}.${USER_X}`;
    const expectedKeyAY = `ohw.cesare.activeSession.${PROJECT_A}.${USER_Y}`;

    const qcA = buildQueryClient();
    qcA.setQueryData(sessionsQueryKey(PROJECT_A), [
      buildSession("sA1", "A1", PROJECT_A, USER_X),
    ]);
    const renderA = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qcA, PROJECT_A, USER_X),
    });
    act(() => renderA.result.current.setActiveSession("sA1"));

    const qcB = buildQueryClient();
    qcB.setQueryData(sessionsQueryKey(PROJECT_B), [
      buildSession("sB1", "B1", PROJECT_B, USER_X),
    ]);
    const renderB = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qcB, PROJECT_B, USER_X),
    });
    act(() => renderB.result.current.setActiveSession("sB1"));

    const qcAY = buildQueryClient();
    qcAY.setQueryData(sessionsQueryKey(PROJECT_A), [
      buildSession("sAY1", "AY1", PROJECT_A, USER_Y),
    ]);
    const renderAY = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qcAY, PROJECT_A, USER_Y),
    });
    act(() => renderAY.result.current.setActiveSession("sAY1"));

    expect(storage.getItem(expectedKeyA)).toBe("sA1");
    expect(storage.getItem(expectedKeyB)).toBe("sB1");
    expect(storage.getItem(expectedKeyAY)).toBe("sAY1");
  });

  it("re-reads the persisted id when projectId changes", () => {
    const expectedKeyA = `ohw.cesare.activeSession.${PROJECT_A}.${USER_X}`;
    const expectedKeyB = `ohw.cesare.activeSession.${PROJECT_B}.${USER_X}`;
    storage.setItem(expectedKeyA, "persisted-A");
    storage.setItem(expectedKeyB, "persisted-B");

    // Seed each project's session list so the auto-default effect doesn't
    // overwrite the persisted id with a fallback `first.id`.
    const qc = buildQueryClient();
    qc.setQueryData(sessionsQueryKey(PROJECT_A), [
      buildSession("persisted-A", "A", PROJECT_A, USER_X),
    ]);
    qc.setQueryData(sessionsQueryKey(PROJECT_B), [
      buildSession("persisted-B", "B", PROJECT_B, USER_X),
    ]);

    const observed: { active: string | null } = { active: null };
    function Observer() {
      observed.active = useSessionsContext().activeSessionId;
      return null;
    }
    function Tree({ projectId }: { projectId: string }) {
      return (
        <QueryClientProvider client={qc}>
          <SessionsProvider projectId={projectId} userId={USER_X}>
            <Observer />
          </SessionsProvider>
        </QueryClientProvider>
      );
    }

    const { rerender } = render(<Tree projectId={PROJECT_A} />);
    expect(observed.active).toBe("persisted-A");

    rerender(<Tree projectId={PROJECT_B} />);
    expect(observed.active).toBe("persisted-B");
  });

  it("setActiveSession(null) with no sessions clears the persisted key", () => {
    const qc = buildQueryClient();
    qc.setQueryData(sessionsQueryKey(PROJECT_A), []);
    const expectedKey = `ohw.cesare.activeSession.${PROJECT_A}.${USER_X}`;
    storage.setItem(expectedKey, "preexisting");

    const { result } = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qc, PROJECT_A, USER_X),
    });

    act(() => result.current.setActiveSession(null));
    expect(storage.getItem(expectedKey)).toBeNull();
  });

  it("setActiveSession(null) re-defaults to the first session when sessions exist", () => {
    const qc = buildQueryClient();
    qc.setQueryData(sessionsQueryKey(PROJECT_A), [
      buildSession("s1", "Una", PROJECT_A, USER_X),
    ]);
    const { result } = renderHook(() => useSessionsContext(), {
      wrapper: wrapperWith(qc, PROJECT_A, USER_X),
    });
    expect(result.current.activeSessionId).toBe("s1");

    // Clearing the active id while sessions exist triggers the default-seed
    // effect on the next render — the active session always points at a
    // real row so the chat surface never goes blank.
    act(() => result.current.setActiveSession(null));
    expect(result.current.activeSessionId).toBe("s1");
  });
});

describe("useSessionsContext (no provider)", () => {
  it("falls back to inert defaults outside SessionsProvider", () => {
    const { result } = renderHook(() => useSessionsContext());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
    expect(typeof result.current.setActiveSession).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });
});
