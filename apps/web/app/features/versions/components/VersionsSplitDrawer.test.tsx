/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmDialogProvider } from "@oh-writers/ui";
import { LocaleProvider } from "~/features/i18n";
import { VersionsSplitDrawer } from "./VersionsSplitDrawer";
import type { VersionView } from "../version-view";

const version = (over: Partial<VersionView> = {}): VersionView => ({
  id: "v-1",
  number: 1,
  label: null,
  createdAt: "2026-07-01T10:00:00.000Z",
  content: "<p>testo</p>",
  draftColor: null,
  draftDate: null,
  kind: "manual",
  cesareSessionId: null,
  ...over,
});

function renderDrawer(
  versions: readonly VersionView[],
  currentVersionId: string,
  over: Partial<Parameters<typeof VersionsSplitDrawer>[0]> = {},
) {
  const props = {
    versions,
    currentVersionId,
    isLoading: false,
    loadError: null,
    renderContent: (v: VersionView) => <div>{v.content}</div>,
    onActivate: vi.fn(),
    onDuplicate: vi.fn(),
    onRename: vi.fn(),
    onSetColor: vi.fn(),
    onCreateNew: vi.fn(),
    canEdit: true,
    ...over,
  };
  render(
    <LocaleProvider locale="it">
      <ConfirmDialogProvider>
        <VersionsSplitDrawer {...props} />
      </ConfirmDialogProvider>
    </LocaleProvider>,
  );
  return props;
}

describe("VersionsSplitDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  // #94 — the current version's detail shows the text already open in the editor
  // and offers no action, so the row must not be a navigation target.
  it("does not open a detail when the CURRENT version row is clicked", () => {
    renderDrawer([version({ id: "v-cur" })], "v-cur");

    expect(screen.queryByTestId("versions-split-open-v-cur")).toBeNull();
    fireEvent.click(screen.getByTestId("versions-split-row-v-cur"));

    expect(screen.getByTestId("versions-split-list")).toBeTruthy();
    expect(screen.queryByTestId("versions-split-detail")).toBeNull();
  });

  it("opens the detail for a NON-current version", () => {
    renderDrawer(
      [version({ id: "v-cur" }), version({ id: "v-old", number: 2 })],
      "v-cur",
    );

    fireEvent.click(screen.getByTestId("versions-split-open-v-old"));

    expect(screen.getByTestId("versions-split-detail")).toBeTruthy();
  });

  // #58 — the rename input used to be a CHILD of the row button, so focusing it
  // fired the row's open-detail handler and the user was bumped into the detail.
  it("keeps the rename field editable without falling into the detail", () => {
    const props = renderDrawer(
      [version({ id: "v-cur" }), version({ id: "v-old", number: 2 })],
      "v-cur",
    );

    fireEvent.click(screen.getByTestId("version-rename-v-old"));
    const input = screen.getByTestId(
      "version-rename-input-v-old",
    ) as HTMLInputElement;

    fireEvent.click(input);
    expect(screen.queryByTestId("versions-split-detail")).toBeNull();

    fireEvent.change(input, { target: { value: "il mio nome" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onRename).toHaveBeenCalledWith("v-old", "il mio nome");
  });

  // #58 — the version number is a separate rendered decoration. Concatenating it
  // produced "Versione 1 (v1)", and after a rename read as if the suffix had been
  // stored into the user's own label.
  it("renders the version number beside the label, never inside it", () => {
    renderDrawer([version({ id: "v-cur", label: "il mio nome" })], "v-cur");

    const label = screen.getByText("il mio nome");
    expect(label.textContent).toBe("il mio nome");
    expect(screen.getByTestId("version-number-v-cur").textContent).toBe("v1");
    expect(screen.queryByText(/\(v1\)/)).toBeNull();
  });

  it("falls back to a numbered name when the version has no label", () => {
    renderDrawer([version({ id: "v-cur", label: null })], "v-cur");

    expect(screen.getByText("Versione 1")).toBeTruthy();
    expect(screen.queryByText(/\(v1\)/)).toBeNull();
  });
});
