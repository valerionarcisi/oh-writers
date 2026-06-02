// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  renderHook,
  act,
} from "@testing-library/react";
import {
  SplitDrawerProvider,
  useSplitDrawer,
  useBellOpener,
} from "../split-drawer-context";
import {
  CesareNotificationProvider,
  useCesareNotifications,
} from "../cesare-notification-context";
import { LocaleProvider } from "~/features/i18n";
import {
  NotificationCenterDrawerHeader,
  NotificationCenterDrawerContent,
} from "./NotificationCenterDrawer";

beforeEach(() => {
  // CesareNotificationProvider hydrates from sessionStorage on mount.
  // Wipe between tests so seeded notifications don't bleed across cases.
  if (typeof window !== "undefined") {
    window.sessionStorage.clear();
  }
});
afterEach(cleanup);

function withProviders(ui: React.ReactNode) {
  return (
    <LocaleProvider locale="it">
      <CesareNotificationProvider>
        <SplitDrawerProvider>{ui}</SplitDrawerProvider>
      </CesareNotificationProvider>
    </LocaleProvider>
  );
}

describe("useBellOpener", () => {
  it("opens the SplitDrawer with a notifications payload", () => {
    const { result } = renderHook(
      () => {
        const open = useBellOpener();
        const splitDrawer = useSplitDrawer();
        return { open, splitDrawer };
      },
      {
        wrapper: ({ children }) => (
          <CesareNotificationProvider>
            <SplitDrawerProvider>{children}</SplitDrawerProvider>
          </CesareNotificationProvider>
        ),
      },
    );

    expect(result.current.splitDrawer.state).toBe("closed");
    expect(result.current.splitDrawer.payload).toBeNull();

    act(() => result.current.open());

    expect(result.current.splitDrawer.state).toBe("open");
    expect(result.current.splitDrawer.payload).not.toBeNull();
    expect(result.current.splitDrawer.payload?.kind).toBe("notifications");
  });

  it("is a stable reference across renders", () => {
    const { result, rerender } = renderHook(() => useBellOpener(), {
      wrapper: ({ children }) => (
        <CesareNotificationProvider>
          <SplitDrawerProvider>{children}</SplitDrawerProvider>
        </CesareNotificationProvider>
      ),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("both BottomDock-style and Cesare-header-style consumers open the same drawer", () => {
    // Simulates the spec 44 invariant: there is ONE notification surface.
    // Both the BottomDock onBell (rendered when Cesare === closed) and the
    // Cesare header dockIcons.onBell (rendered when Cesare !== closed) read
    // from the same SplitDrawer context, so clicking either entry-point
    // routes to the same drawer.
    let captured: ReturnType<typeof useSplitDrawer> | null = null;

    function DockBell() {
      const openBell = useBellOpener();
      return (
        <button data-testid="dock-bell" onClick={openBell}>
          Dock bell
        </button>
      );
    }

    function CesareHeaderBell() {
      const openBell = useBellOpener();
      return (
        <button data-testid="cesare-header-bell" onClick={openBell}>
          Cesare header bell
        </button>
      );
    }

    function Capture() {
      captured = useSplitDrawer();
      return null;
    }

    render(
      withProviders(
        <>
          <Capture />
          <DockBell />
          <CesareHeaderBell />
        </>,
      ),
    );

    expect(captured!.state).toBe("closed");

    fireEvent.click(screen.getByTestId("dock-bell"));
    expect(captured!.state).toBe("open");
    expect(captured!.payload?.kind).toBe("notifications");

    act(() => captured!.close());
    expect(captured!.state).toBe("closed");

    fireEvent.click(screen.getByTestId("cesare-header-bell"));
    expect(captured!.state).toBe("open");
    expect(captured!.payload?.kind).toBe("notifications");
  });
});

describe("NotificationCenterDrawerHeader", () => {
  it("shows the 'Tutto letto' state when no notifications are unseen", () => {
    render(withProviders(<NotificationCenterDrawerHeader />));
    expect(screen.getByText("Notifiche Cesare")).toBeTruthy();
    expect(screen.getByText("Tutto letto")).toBeTruthy();
  });

  it("renders the 'Segna tutte come lette' action when there are unseen items", () => {
    function Harness() {
      const { startNotification, completeNotification } =
        useCesareNotifications();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const id = startNotification({
                actionLabel: "Test",
                page: "soggetto",
                projectId: "p1",
              });
              completeNotification(id, { resultLabel: "Fatto" });
            }}
            data-testid="seed"
          >
            Seed
          </button>
          <NotificationCenterDrawerHeader />
        </>
      );
    }
    render(withProviders(<Harness />));
    fireEvent.click(screen.getByTestId("seed"));
    expect(screen.getByText("Segna tutte come lette")).toBeTruthy();
  });
});

describe("NotificationCenterDrawerContent — pulse + navigate flow", () => {
  it("forwards the full notification object (page + affectedEntities) to onActivate", () => {
    // Spec 44: clicking a row pulses the affected entities and navigates to
    // the originating page. AppShell wires that behaviour; the drawer just
    // forwards the full notification record. This test guards the contract.
    const onActivate = vi.fn();

    function Harness() {
      const { startNotification, completeNotification } =
        useCesareNotifications();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const id = startNotification({
                actionLabel: "Aggiungi candidato",
                page: "locations",
                projectId: "p1",
              });
              completeNotification(id, {
                resultLabel: "2 candidati location aggiunti",
                affectedEntities: [
                  { kind: "candidate", id: "cand-1" },
                  { kind: "candidate", id: "cand-2" },
                ],
              });
            }}
            data-testid="seed"
          >
            Seed
          </button>
          <NotificationCenterDrawerContent onActivate={onActivate} />
        </>
      );
    }
    render(withProviders(<Harness />));
    fireEvent.click(screen.getByTestId("seed"));
    const row = screen
      .getByText("2 candidati location aggiunti")
      .closest("button");
    expect(row).toBeTruthy();
    if (row) fireEvent.click(row);
    expect(onActivate).toHaveBeenCalledTimes(1);
    const arg = onActivate.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg.page).toBe("locations");
    expect(arg.projectId).toBe("p1");
    expect(arg.affectedEntities).toHaveLength(2);
  });
});

describe("NotificationCenterDrawerContent", () => {
  it("renders the empty state when no notifications exist", () => {
    render(
      withProviders(<NotificationCenterDrawerContent onActivate={() => {}} />),
    );
    expect(screen.getByText(/Nessuna notifica/i)).toBeTruthy();
  });

  it("invokes onActivate when a row is clicked", () => {
    const onActivate = vi.fn();

    function Harness() {
      const { startNotification, completeNotification, notifications } =
        useCesareNotifications();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const id = startNotification({
                actionLabel: "Espandi Atto II",
                page: "soggetto",
                projectId: "p1",
              });
              completeNotification(id, {
                resultLabel: "Soggetto aggiornato",
                affectedEntities: [{ kind: "document", id: "doc-1" }],
              });
            }}
            data-testid="seed"
          >
            Seed
          </button>
          <NotificationCenterDrawerContent onActivate={onActivate} />
          <span data-testid="count">{notifications.length}</span>
        </>
      );
    }
    render(withProviders(<Harness />));
    fireEvent.click(screen.getByTestId("seed"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    const row = screen.getByText("Soggetto aggiornato").closest("button");
    expect(row).toBeTruthy();
    if (row) fireEvent.click(row);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]?.[0]?.page).toBe("soggetto");
  });
});
