/**
 * @vitest-environment jsdom
 *
 * Spec 78 §A2 — the entity-page Cesare-updated confirmation line. The agentic-edit
 * pattern (CLAUDE.md): the edit applies LIVE behind the chat, the chat result card
 * is the record, true revert lives in the Versions drawer (Spec 47e). So this
 * surface is ONE discreet, auto-dismissing line — never a stack, no "Mostra cosa è
 * cambiato" highlight, no inline undo. These tests pin that contract against the
 * real component + real live-edit store.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { DocumentTypes } from "@oh-writers/domain";
import { CesareUpdatedBanner } from "./CesareUpdatedBanner";
import {
  publishLiveEdits,
  clearLiveEdits,
} from "~/features/app-shell/cesare-live-edit-store";
import { LocaleProvider } from "~/features/i18n";

const publishSoggetto = (summary: string) =>
  act(() => {
    publishLiveEdits([
      {
        documentType: DocumentTypes.SOGGETTO,
        label: "Soggetto",
        segments: [
          { op: "eq", text: "Un film " },
          { op: "add", text: summary },
        ],
        summary,
        previousVersionId: null,
      },
    ]);
  });

const renderBanner = () =>
  render(
    <LocaleProvider locale="it">
      <CesareUpdatedBanner documentType={DocumentTypes.SOGGETTO} />
    </LocaleProvider>,
  );

afterEach(() => {
  cleanup();
  clearLiveEdits(DocumentTypes.SOGGETTO);
  vi.useRealTimers();
});

describe("CesareUpdatedBanner — one discreet line, no clutter", () => {
  it("renders nothing until an edit is published", () => {
    renderBanner();
    expect(screen.queryByTestId("cesare-updated-banner")).toBeNull();
  });

  it("shows ONE line with no see/undo/stack affordances", () => {
    renderBanner();
    publishSoggetto("primo");
    expect(screen.getByTestId("cesare-updated-banner")).toBeTruthy();
    // The clutter is gone: no "Mostra cosa è cambiato", no inline undo, no stack.
    expect(screen.queryByTestId("cesare-updated-see")).toBeNull();
    expect(screen.queryByTestId("cesare-updated-undo")).toBeNull();
    expect(screen.queryByTestId("cesare-updated-stack-toggle")).toBeNull();
    expect(screen.queryByTestId("cesare-updated-count")).toBeNull();
    // Only the dismiss × remains.
    expect(screen.getByTestId("cesare-updated-dismiss")).toBeTruthy();
  });

  it("REPLACES the line on a second turn — never stacks two cards", () => {
    renderBanner();
    publishSoggetto("primo");
    publishSoggetto("secondo");
    expect(screen.getAllByTestId("cesare-updated-banner")).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-testid^="cesare-updated-card-"]'),
    ).toHaveLength(1);
    expect(
      screen
        .getByTestId("cesare-updated-banner")
        .getAttribute("data-stack-count"),
    ).toBe("1");
  });

  it("dismiss × hides the line", () => {
    renderBanner();
    publishSoggetto("primo");
    act(() => {
      screen.getByTestId("cesare-updated-dismiss").click();
    });
    expect(screen.queryByTestId("cesare-updated-banner")).toBeNull();
  });

  it("auto-dismisses the line after the linger window", () => {
    vi.useFakeTimers();
    renderBanner();
    publishSoggetto("primo");
    expect(screen.getByTestId("cesare-updated-banner")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByTestId("cesare-updated-banner")).toBeNull();
  });
});
