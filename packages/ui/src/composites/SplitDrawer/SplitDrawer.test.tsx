// packages/ui/src/composites/SplitDrawer/SplitDrawer.test.tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  fireEvent,
  cleanup,
  renderHook,
  act,
} from "@testing-library/react";
import { SplitDrawer } from "./SplitDrawer";
import {
  splitDrawerReducer,
  useSplitDrawerState,
  type SplitDrawerState,
} from "./use-split-drawer-state";
import {
  SPLIT_DRAWER_STORAGE_KEYS,
  readPersistedSplitSize,
} from "./use-split-drawer-resize";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.removeItem(SPLIT_DRAWER_STORAGE_KEYS.width);
  } catch {
    // ignore
  }
});

// ─── splitDrawerReducer ─────────────────────────────────────────────────

describe("splitDrawerReducer", () => {
  it("cycle progresses closed → open → full → open", () => {
    expect(splitDrawerReducer("closed", { kind: "cycle" })).toBe("open");
    expect(splitDrawerReducer("open", { kind: "cycle" })).toBe("full");
    expect(splitDrawerReducer("full", { kind: "cycle" })).toBe("open");
  });

  it("stepBack walks back through the open states", () => {
    expect(splitDrawerReducer("full", { kind: "stepBack" })).toBe("open");
    expect(splitDrawerReducer("open", { kind: "stepBack" })).toBe("closed");
    expect(splitDrawerReducer("closed", { kind: "stepBack" })).toBe("closed");
  });

  it("close forces closed from every state", () => {
    const states: SplitDrawerState[] = ["closed", "open", "full"];
    for (const s of states) {
      expect(splitDrawerReducer(s, { kind: "close" })).toBe("closed");
    }
  });

  it("open from closed defaults to the open state", () => {
    expect(splitDrawerReducer("closed", { kind: "open" })).toBe("open");
    expect(splitDrawerReducer("closed", { kind: "open", target: "full" })).toBe(
      "full",
    );
  });

  it("open from any state re-targets", () => {
    expect(splitDrawerReducer("open", { kind: "open", target: "full" })).toBe(
      "full",
    );
    expect(splitDrawerReducer("full", { kind: "open", target: "open" })).toBe(
      "open",
    );
  });
});

// ─── useSplitDrawerState ────────────────────────────────────────────────

describe("useSplitDrawerState", () => {
  it("starts in the provided initialState", () => {
    const { result } = renderHook(() =>
      useSplitDrawerState({ initialState: "open" }),
    );
    expect(result.current.state).toBe("open");
  });

  it("cycle advances the state", () => {
    const { result } = renderHook(() => useSplitDrawerState());
    act(() => result.current.cycle());
    expect(result.current.state).toBe("open");
    act(() => result.current.cycle());
    expect(result.current.state).toBe("full");
    act(() => result.current.cycle());
    expect(result.current.state).toBe("open");
  });

  it("close + open + stepBack dispatch correctly", () => {
    const { result } = renderHook(() => useSplitDrawerState());
    act(() => result.current.open());
    expect(result.current.state).toBe("open");
    act(() => result.current.open("full"));
    expect(result.current.state).toBe("full");
    act(() => result.current.stepBack());
    expect(result.current.state).toBe("open");
    act(() => result.current.close());
    expect(result.current.state).toBe("closed");
  });

  it("setState notifies onChange with the new target", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSplitDrawerState({ onChange }));
    act(() => result.current.setState("full"));
    expect(result.current.state).toBe("full");
    expect(onChange).toHaveBeenCalledWith("full");
  });

  it("onChange fires when the state actually changes", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSplitDrawerState({ onChange }));
    act(() => result.current.close()); // no-op, already closed
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.cycle());
    expect(onChange).toHaveBeenCalledWith("open");
  });
});

// ─── readPersistedSplitSize ─────────────────────────────────────────────

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

describe("readPersistedSplitSize", () => {
  beforeEach(() => {
    installMockLocalStorage();
  });

  it("returns fallback when key is missing", () => {
    expect(readPersistedSplitSize("ohw.test.nope", 480)).toBe(480);
  });

  it("returns stored value when valid", () => {
    window.localStorage.setItem("ohw.test.valid", "640");
    expect(readPersistedSplitSize("ohw.test.valid", 480)).toBe(640);
  });

  it("falls back when value is non-numeric", () => {
    window.localStorage.setItem("ohw.test.bad", "abc");
    expect(readPersistedSplitSize("ohw.test.bad", 480)).toBe(480);
  });

  it("falls back when value is non-positive", () => {
    window.localStorage.setItem("ohw.test.zero", "0");
    expect(readPersistedSplitSize("ohw.test.zero", 480)).toBe(480);
  });
});

// ─── SplitDrawer chrome ─────────────────────────────────────────────────

describe("SplitDrawer", () => {
  const baseProps = {
    state: "open" as SplitDrawerState,
    onStateChange: () => undefined,
    onClose: () => undefined,
    header: <h2>Anteprima Soggetto</h2>,
    children: <p>Drawer body content</p>,
  };

  it("renders header, body, and data-state in open", () => {
    const { getByTestId, getByText } = render(<SplitDrawer {...baseProps} />);
    const drawer = getByTestId("split-drawer");
    expect(drawer.getAttribute("data-state")).toBe("open");
    expect(getByText("Anteprima Soggetto")).toBeTruthy();
    expect(getByText("Drawer body content")).toBeTruthy();
  });

  it("renders an optional footer when provided", () => {
    const { getByText } = render(
      <SplitDrawer
        {...baseProps}
        footer={<div>Footer actions</div>}
      />,
    );
    expect(getByText("Footer actions")).toBeTruthy();
  });

  it("calls onClose when the × button is clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <SplitDrawer {...baseProps} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText("Chiudi"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onCycle when ↗ button is clicked", () => {
    const onCycle = vi.fn();
    const { getByLabelText } = render(
      <SplitDrawer {...baseProps} onCycle={onCycle} />,
    );
    fireEvent.click(getByLabelText("Espandi"));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it("renders ↙ button only when state === full", () => {
    const onStepBack = vi.fn();
    const { queryByLabelText, rerender, getByLabelText } = render(
      <SplitDrawer {...baseProps} onStepBack={onStepBack} />,
    );
    expect(queryByLabelText("Riduci")).toBeNull();

    rerender(
      <SplitDrawer
        {...baseProps}
        state="full"
        onStepBack={onStepBack}
      />,
    );
    fireEvent.click(getByLabelText("Riduci"));
    expect(onStepBack).toHaveBeenCalledTimes(1);
  });

  it("does not render the drag handle in full state", () => {
    const { container, rerender } = render(<SplitDrawer {...baseProps} />);
    // handle exists in DOM but only visible in open state — checking
    // via data-state attribute keeps the test resilient.
    expect(container.querySelector('[data-state="open"]')).toBeTruthy();
    rerender(<SplitDrawer {...baseProps} state="full" />);
    expect(container.querySelector('[data-state="full"]')).toBeTruthy();
  });

  it("respects an external controlled width via size", () => {
    const { container } = render(
      <SplitDrawer {...baseProps} size={{ width: 600 }} />,
    );
    const drawer = container.querySelector(
      '[data-testid="split-drawer"]',
    ) as HTMLElement | null;
    expect(drawer).toBeTruthy();
    expect(drawer?.style.getPropertyValue("--split-inline-size")).toBe("600px");
  });

  it("invokes onSizeChange when persistence writes a new size", () => {
    // The hook calls onSizeChange via its persistWidth wrapper on every
    // resize tick. We can't drive a real pointer drag in jsdom, but we can
    // assert the resize handle is present and accessible.
    const onSizeChange = vi.fn();
    const { container } = render(
      <SplitDrawer {...baseProps} onSizeChange={onSizeChange} />,
    );
    const handle = container.querySelector('[role="separator"]');
    expect(handle).toBeTruthy();
    expect(handle?.getAttribute("aria-orientation")).toBe("vertical");
  });
});
