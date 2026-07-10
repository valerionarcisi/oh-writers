/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  Route,
  ScreenplayEditorPage,
} from "./_app.projects.$id_.screenplay.index";
import { Route as appRoute } from "./_app";
import { FeatureProvider } from "~/features/feature-flags";

const useScreenplayMock = vi.fn();

vi.mock("~/features/screenplay-editor", () => ({
  ScreenplayEditor: () => <div data-testid="screenplay-editor" />,
  ScreenplayCesarePanel: () => <div data-testid="screenplay-cesare-panel" />,
  ScreenplayEditorShell: ({
    children,
    cesarePanel,
    isCesarePanelOpen,
  }: {
    children: ReactNode;
    cesarePanel?: ReactNode;
    isCesarePanelOpen?: boolean;
  }) => (
    <div data-testid="screenplay-shell" data-open={String(isCesarePanelOpen)}>
      {cesarePanel}
      {children}
    </div>
  ),
  ScreenplayElementChips: () => <div data-testid="screenplay-chips" />,
  useScreenplay: (...args: unknown[]) => useScreenplayMock(...args),
}));

describe("ScreenplayEditorPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useScreenplayMock.mockReset();
  });

  it("mounts Cesare in the screenplay shell when the screenplay loads", () => {
    useScreenplayMock.mockReturnValue({
      data: {
        isOk: true,
        value: {
          id: "screenplay-1",
          title: "Walkie-Talkie",
          currentVersionId: "v1",
        },
      },
      isLoading: false,
    });

    vi.spyOn(Route, "useParams").mockReturnValue({ id: "project-1" } as never);
    vi.spyOn(appRoute, "useLoaderData").mockReturnValue({
      user: { id: "user-1", name: "User" },
    } as never);

    render(
      <FeatureProvider locale="it" isDevEnvironment={false} isAiEnabled={true}>
        <ScreenplayEditorPage />
      </FeatureProvider>,
    );

    expect(
      screen.getByTestId("screenplay-shell").getAttribute("data-open"),
    ).toBe("true");
    expect(screen.getByTestId("screenplay-cesare-panel")).toBeTruthy();
    expect(screen.getByTestId("screenplay-editor")).toBeTruthy();
  });
});
