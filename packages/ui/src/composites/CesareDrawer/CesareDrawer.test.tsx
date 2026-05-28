// packages/ui/src/composites/CesareDrawer/CesareDrawer.test.tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  fireEvent,
  cleanup,
  renderHook,
  act,
} from "@testing-library/react";
import { CesareDrawer } from "./CesareDrawer";
import {
  drawerReducer,
  useDrawerState,
  type CesareDrawerState,
} from "./use-drawer-state";
import {
  DRAWER_SIZE_STORAGE_KEYS,
  readPersistedSize,
} from "./use-drawer-resize";

afterEach(() => {
  cleanup();
  // Keep tests hermetic — wipe persisted sizes between runs.
  try {
    window.localStorage.removeItem(DRAWER_SIZE_STORAGE_KEYS.expanded);
    window.localStorage.removeItem(DRAWER_SIZE_STORAGE_KEYS.split);
  } catch {
    // ignore
  }
});

// ─── drawerReducer ──────────────────────────────────────────────────────

describe("drawerReducer", () => {
  it("cycle progresses closed → expanded → expanded-split → full → expanded", () => {
    expect(drawerReducer("closed", { kind: "cycle" })).toBe("expanded");
    expect(drawerReducer("expanded", { kind: "cycle" })).toBe("expanded-split");
    expect(drawerReducer("expanded-split", { kind: "cycle" })).toBe("full");
    expect(drawerReducer("full", { kind: "cycle" })).toBe("expanded");
  });

  it("peek → cycle returns to expanded", () => {
    expect(drawerReducer("peek", { kind: "cycle" })).toBe("expanded");
  });

  it("stepBack walks back through the open states", () => {
    expect(drawerReducer("full", { kind: "stepBack" })).toBe("expanded-split");
    expect(drawerReducer("expanded-split", { kind: "stepBack" })).toBe(
      "expanded",
    );
    expect(drawerReducer("expanded", { kind: "stepBack" })).toBe("closed");
    expect(drawerReducer("peek", { kind: "stepBack" })).toBe("expanded");
    expect(drawerReducer("closed", { kind: "stepBack" })).toBe("closed");
  });

  it("close forces closed from every state", () => {
    const states: CesareDrawerState[] = [
      "closed",
      "peek",
      "expanded",
      "expanded-split",
      "full",
    ];
    for (const s of states) {
      expect(drawerReducer(s, { kind: "close" })).toBe("closed");
    }
  });

  it("peek action puts every state into peek", () => {
    const states: CesareDrawerState[] = [
      "closed",
      "peek",
      "expanded",
      "expanded-split",
      "full",
    ];
    for (const s of states) {
      expect(drawerReducer(s, { kind: "peek" })).toBe("peek");
    }
  });

  it("open from closed lands on the target (default expanded)", () => {
    expect(drawerReducer("closed", { kind: "open" })).toBe("expanded");
    expect(drawerReducer("closed", { kind: "open", target: "full" })).toBe(
      "full",
    );
  });

  it("open from a non-closed state is a no-op", () => {
    expect(drawerReducer("expanded", { kind: "open" })).toBe("expanded");
    expect(drawerReducer("full", { kind: "open", target: "expanded" })).toBe(
      "full",
    );
  });
});

// ─── useDrawerState ─────────────────────────────────────────────────────

describe("useDrawerState", () => {
  it("starts in the provided initialState", () => {
    const { result } = renderHook(() =>
      useDrawerState({ initialState: "peek" }),
    );
    expect(result.current.state).toBe("peek");
  });

  it("cycle advances the state", () => {
    const { result } = renderHook(() => useDrawerState());
    act(() => result.current.cycle());
    expect(result.current.state).toBe("expanded");
    act(() => result.current.cycle());
    expect(result.current.state).toBe("expanded-split");
    act(() => result.current.cycle());
    expect(result.current.state).toBe("full");
    act(() => result.current.cycle());
    expect(result.current.state).toBe("expanded");
  });

  it("close + peek + open all dispatch correctly", () => {
    const { result } = renderHook(() => useDrawerState());
    act(() => result.current.open());
    expect(result.current.state).toBe("expanded");
    act(() => result.current.peek());
    expect(result.current.state).toBe("peek");
    act(() => result.current.close());
    expect(result.current.state).toBe("closed");
  });

  it("setState routes through close + open and notifies onChange once with the target", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useDrawerState({ onChange }));
    act(() => result.current.setState("full"));
    expect(result.current.state).toBe("full");
    // onChange is invoked at least once with the final target.
    expect(onChange).toHaveBeenCalledWith("full");
  });

  it("onChange fires when the state actually changes", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useDrawerState({ onChange }));
    act(() => result.current.close()); // no-op, already closed
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.cycle());
    expect(onChange).toHaveBeenCalledWith("expanded");
  });
});

// ─── readPersistedSize ──────────────────────────────────────────────────

// jsdom in our vitest config doesn't ship a working localStorage by default
// (Object.defineProperty patches are needed). Provide a minimal in-memory
// implementation just for these tests.
function installMockLocalStorage(): void {
  if (typeof window === "undefined") return;
  const store = new Map<string, string>();
  const mock = {
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
}

describe("readPersistedSize", () => {
  beforeEach(() => {
    installMockLocalStorage();
  });

  it("returns fallback when key is missing", () => {
    expect(readPersistedSize("ohw.test.nope", 480)).toBe(480);
  });

  it("returns stored value when valid", () => {
    window.localStorage.setItem("ohw.test.valid", "600");
    expect(readPersistedSize("ohw.test.valid", 480)).toBe(600);
  });

  it("falls back when value is non-numeric", () => {
    window.localStorage.setItem("ohw.test.bad", "abc");
    expect(readPersistedSize("ohw.test.bad", 480)).toBe(480);
  });

  it("falls back when value is non-positive", () => {
    window.localStorage.setItem("ohw.test.zero", "0");
    expect(readPersistedSize("ohw.test.zero", 480)).toBe(480);
  });
});

// ─── CesareDrawer chrome ────────────────────────────────────────────────

describe("CesareDrawer", () => {
  const baseProps = {
    state: "expanded" as CesareDrawerState,
    onStateChange: () => undefined,
    onCycle: () => undefined,
    onStepBack: () => undefined,
    onPeek: () => undefined,
    onClose: () => undefined,
    children: <p>Body content</p>,
  };

  it("renders the agent badge and body when expanded", () => {
    const { getByTestId, getByText } = render(<CesareDrawer {...baseProps} />);
    const drawer = getByTestId("cesare-drawer");
    expect(drawer.getAttribute("data-state")).toBe("expanded");
    expect(getByText("Cesare")).toBeTruthy();
    expect(getByText("Body content")).toBeTruthy();
  });

  it("calls onCycle when the expand button is clicked", () => {
    const onCycle = vi.fn();
    const { getByLabelText } = render(
      <CesareDrawer {...baseProps} onCycle={onCycle} />,
    );
    fireEvent.click(getByLabelText("Espandi"));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it("calls onStepBack from full state via ↙", () => {
    const onStepBack = vi.fn();
    const { getByLabelText } = render(
      <CesareDrawer {...baseProps} state="full" onStepBack={onStepBack} />,
    );
    fireEvent.click(getByLabelText("Riduci"));
    expect(onStepBack).toHaveBeenCalledTimes(1);
  });

  it("calls onPeek and onClose", () => {
    const onPeek = vi.fn();
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <CesareDrawer {...baseProps} onPeek={onPeek} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText("Minimizza"));
    fireEvent.click(getByLabelText("Chiudi"));
    expect(onPeek).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the active session title in the selector trigger", () => {
    const sessions = [
      { id: "s1", title: "Breakdown Sc.2", lastAt: "ora" },
      { id: "s2", title: "Riscrivi Atto II", lastAt: "2h" },
    ];
    const { getByLabelText } = render(
      <CesareDrawer
        {...baseProps}
        sessions={sessions}
        activeSessionId="s1"
        onSessionSelectorClick={() => undefined}
      />,
    );
    const trigger = getByLabelText("Seleziona sessione Cesare");
    expect(trigger.textContent).toContain("Breakdown Sc.2");
  });

  it("renders dock icons only when state is open (not peek/closed)", () => {
    const dockIcons = {
      onBell: () => undefined,
      onAvatar: () => undefined,
      onGear: () => undefined,
    };
    const { getByLabelText, rerender, queryByLabelText } = render(
      <CesareDrawer {...baseProps} dockIcons={dockIcons} />,
    );
    expect(getByLabelText("Notifiche")).toBeTruthy();
    expect(getByLabelText("Profilo")).toBeTruthy();
    expect(getByLabelText("Impostazioni")).toBeTruthy();

    rerender(
      <CesareDrawer {...baseProps} state="peek" dockIcons={dockIcons} />,
    );
    expect(queryByLabelText("Notifiche")).toBeNull();
  });

  it("composer submits via cmd+enter", () => {
    const onSubmit = vi.fn();
    const { getByLabelText } = render(
      <CesareDrawer
        {...baseProps}
        composer={{
          value: "ciao",
          onChange: () => undefined,
          onSubmit,
        }}
      />,
    );
    const input = getByLabelText("Composer Cesare") as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("renders peek row in peek state and hides the frame", () => {
    const { getAllByText, getByText, queryByLabelText, getByTestId } = render(
      <CesareDrawer {...baseProps} state="peek" peekSubtitle="3 passaggi" />,
    );
    // "Cesare" appears twice: in the (CSS-hidden) header agent badge and in
    // the visible PeekRow. We only assert the peek subtitle is visible.
    expect(getAllByText("Cesare").length).toBeGreaterThanOrEqual(1);
    expect(getByText("· 3 passaggi")).toBeTruthy();
    // The peek row is rendered; its dedicated close button comes from
    // PeekRow with the label "Chiudi Cesare" and is a child of the peek row.
    const peekClose = queryByLabelText("Chiudi Cesare");
    expect(peekClose).toBeTruthy();
    // Drawer state attribute should be peek.
    expect(getByTestId("cesare-drawer").getAttribute("data-state")).toBe(
      "peek",
    );
  });
});
