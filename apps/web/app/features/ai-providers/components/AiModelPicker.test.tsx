/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "~/features/i18n";
import { AiModelPicker } from "./AiModelPicker";
import type { CatalogueModel } from "../model-catalogue.server";

// Real-use report: "I tried to change the model but it's not clear." Two
// causes, both pinned here:
//   the cards showed the RECOMMENDED model even when a different one was
//     saved, so a successful change was invisible;
//   the actual selector hid behind a collapsed "Avanzate" toggle while the
//     cards looked like the interaction surface.
// The cards are now the entry point (click → catalogue scoped to that role)
// and always name the model actually selected.

const model = (
  id: string,
  name: string,
  euroPerFeatureFilm = 1,
): CatalogueModel => ({ id, name, euroPerFeatureFilm }) as CatalogueModel;

const HAIKU = model("anthropic/claude-haiku-4.5", "Claude Haiku 4.5", 1.61);
const SONNET = model("anthropic/claude-sonnet-5", "Claude Sonnet 5", 3.22);
const GEMINI = model("google/gemini-flash", "Gemini Flash", 0.29);

const renderPicker = (value: { fast: string; quality: string }) => {
  const onChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // The component reads the catalogue from this cache entry; seeding it keeps
  // the test off the network and off the server-fn module.
  queryClient.setQueryData(["ai-provider", "model-catalogue"], {
    isOk: true,
    value: [HAIKU, SONNET, GEMINI],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider locale="it">
        <AiModelPicker
          recommendedFast={HAIKU}
          recommendedQuality={SONNET}
          value={value}
          onChange={onChange}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { onChange };
};

afterEach(cleanup);

describe("AiModelPicker", () => {
  it("the card names the SELECTED model, not the recommendation", () => {
    // The saved fast model is Gemini; the old card kept saying Haiku, so the
    // user's change looked like it never happened.
    renderPicker({ fast: GEMINI.id, quality: SONNET.id });
    const fastCard = screen.getByTestId("ai-model-role-fast");
    expect(fastCard.textContent).toContain("Gemini Flash");
    expect(fastCard.textContent).not.toContain("Haiku");
  });

  it("clicking a card opens the catalogue scoped to that role", () => {
    renderPicker({ fast: HAIKU.id, quality: SONNET.id });
    expect(screen.queryByTestId("ai-model-advanced-panel")).toBeNull();

    fireEvent.click(screen.getByTestId("ai-model-role-fast"));
    expect(screen.getByTestId("ai-model-advanced-panel")).toBeTruthy();
    // The fast slot's current model is the checked option.
    const checked = screen.getByTestId(
      `ai-model-option-${HAIKU.id}`,
    ) as HTMLInputElement;
    expect(checked.checked).toBe(true);
  });

  it("picking a model updates that role and the card follows", () => {
    const { onChange } = renderPicker({ fast: HAIKU.id, quality: SONNET.id });
    fireEvent.click(screen.getByTestId("ai-model-role-fast"));
    fireEvent.click(screen.getByTestId(`ai-model-option-${GEMINI.id}`));

    expect(onChange).toHaveBeenCalledWith({
      fast: GEMINI.id,
      quality: SONNET.id,
    });
  });

  it("clicking the other card switches the catalogue to that role", () => {
    renderPicker({ fast: HAIKU.id, quality: SONNET.id });
    fireEvent.click(screen.getByTestId("ai-model-role-fast"));
    fireEvent.click(screen.getByTestId("ai-model-role-quality"));

    const checked = screen.getByTestId(
      `ai-model-option-${SONNET.id}`,
    ) as HTMLInputElement;
    expect(checked.checked).toBe(true);
  });

  it("clicking the open card again collapses the catalogue", () => {
    renderPicker({ fast: HAIKU.id, quality: SONNET.id });
    fireEvent.click(screen.getByTestId("ai-model-role-fast"));
    fireEvent.click(screen.getByTestId("ai-model-role-fast"));
    expect(screen.queryByTestId("ai-model-advanced-panel")).toBeNull();
  });
});
