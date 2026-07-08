/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LocaleProvider } from "~/features/i18n";
import { MessageView } from "./CesareConversation";
import type { ChatMessage } from "../use-cesare-chat-reducer";

// Task 4 (streaming) — MessageView's pending-with-content branch: once
// text-delta events have accumulated into `message.content`, the bubble
// shows that text progressively instead of only the step trace/loading
// skeleton, with a blinking caret while the turn is still in flight.

const pendingMessage = (
  content: string,
  trace: ChatMessage["trace"] = [],
): ChatMessage => ({
  id: "a1",
  role: "assistant",
  content,
  status: "pending",
  trace,
});

function renderMessage(message: ChatMessage) {
  return render(
    <LocaleProvider locale="it">
      <MessageView message={message} />
    </LocaleProvider>,
  );
}

describe("MessageView — progressive streaming text (Task 4)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders accumulated content while pending, with the streaming caret", () => {
    renderMessage(pendingMessage("Ciao, come"));
    const bubble = screen.getByTestId("cesare-streaming-text");
    expect(bubble.textContent).toContain("Ciao, come");
  });

  it("falls back to the loading indicator when pending with no content yet", () => {
    renderMessage(pendingMessage(""));
    expect(screen.queryByTestId("cesare-streaming-text")).toBeNull();
  });

  it("prefers accumulated content over the trace once text has started streaming", () => {
    renderMessage(
      pendingMessage("Parziale…", [
        { kind: "reading", entity: null, text: "Soggetto" },
      ]),
    );
    expect(screen.getByTestId("cesare-streaming-text")).toBeTruthy();
  });
});
