// @vitest-environment jsdom
//
// BUG-066 — one bell row per Cesare turn. The start row ("sta lavorando")
// must COLLAPSE into the completed row by updating the same notification id,
// never appending a second entry; multiple turns yield multiple rows.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  CesareNotificationProvider,
  useCesareNotifications,
} from "./cesare-notification-context";

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => (
  <CesareNotificationProvider>{children}</CesareNotificationProvider>
);

const startInput = {
  actionLabel: "Cesare sta lavorando sul soggetto…",
  page: "soggetto" as const,
  projectId: "p1",
};

describe("one notification per turn (start → complete in place)", () => {
  it("a started turn shows exactly ONE in-progress row", () => {
    const { result } = renderHook(() => useCesareNotifications(), { wrapper });
    act(() => {
      result.current.startNotification(startInput);
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.status).toBe("in-progress");
    expect(result.current.notifications[0]?.actionLabel).toBe(
      "Cesare sta lavorando sul soggetto…",
    );
  });

  it("completing updates the SAME row in place — still one row", () => {
    const { result } = renderHook(() => useCesareNotifications(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.startNotification(startInput);
    });
    act(() => {
      result.current.completeNotification(id, {
        resultLabel: "Cesare ha aggiornato il soggetto",
        target: { page: "soggetto", goToLabel: "Vai al soggetto" },
      });
    });
    expect(result.current.notifications).toHaveLength(1);
    const row = result.current.notifications[0]!;
    expect(row.id).toBe(id);
    expect(row.status).toBe("completed");
    expect(row.resultLabel).toBe("Cesare ha aggiornato il soggetto");
    expect(row.target).toEqual({
      page: "soggetto",
      goToLabel: "Vai al soggetto",
    });
  });

  it("failing updates the SAME row in place — still one row", () => {
    const { result } = renderHook(() => useCesareNotifications(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.startNotification(startInput);
    });
    act(() => {
      result.current.failNotification(id, "Cesare ha avuto un problema");
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.status).toBe("failed");
  });

  it("dismissing the pending row removes it (conversational turn)", () => {
    const { result } = renderHook(() => useCesareNotifications(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.startNotification(startInput);
    });
    act(() => {
      result.current.dismissNotification(id);
    });
    expect(result.current.notifications).toHaveLength(0);
  });

  it("two turns produce exactly two rows, each settled independently", () => {
    const { result } = renderHook(() => useCesareNotifications(), { wrapper });
    let first = "";
    let second = "";
    act(() => {
      first = result.current.startNotification(startInput);
    });
    act(() => {
      result.current.completeNotification(first, { resultLabel: "Fatto 1" });
    });
    act(() => {
      second = result.current.startNotification(startInput);
    });
    act(() => {
      result.current.completeNotification(second, { resultLabel: "Fatto 2" });
    });
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.notifications.map((n) => n.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(new Set(result.current.notifications.map((n) => n.id)).size).toBe(2);
  });
});

describe("sessionStorage hydration", () => {
  it("drops persisted in-progress rows (a reload kills the turn)", async () => {
    window.sessionStorage.setItem(
      "ohw:cesare-notifications",
      JSON.stringify([
        {
          id: "stuck",
          status: "in-progress",
          startedAt: Date.now(),
          actionLabel: "Cesare sta lavorando sul soggetto…",
          page: "soggetto",
          projectId: "p1",
          seen: true,
        },
        {
          id: "done",
          status: "completed",
          startedAt: Date.now(),
          completedAt: Date.now(),
          actionLabel: "Cesare sta lavorando sul soggetto…",
          resultLabel: "Cesare ha aggiornato il soggetto",
          page: "soggetto",
          projectId: "p1",
          seen: true,
        },
      ]),
    );
    const { result } = renderHook(() => useCesareNotifications(), { wrapper });
    // Hydration runs in a mount effect.
    await act(async () => {});
    expect(result.current.notifications.map((n) => n.id)).toEqual(["done"]);
  });
});
